// tests/outils.test.js — outils testés avec un serveur et une base simulés
// db.js et reponse.js sont remplacés par des mocks : aucun accès réseau ni base.
jest.mock('../src/db', () => ({ executerLecture: jest.fn() }));
jest.mock('../src/tools/reponse', () => ({
  json: (o) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] }),
  erreur: (m) => ({ isError: true, content: [{ type: 'text', text: m }] }),
  outil: (nom, handler) => handler,
}));

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { executerLecture } = require('../src/db');
const enregistrerTousLesOutils = require('../src/tools/index');
const { construireRequeteCommandes } = require('../src/tools/commandes');
const enregistrerOutilDoc = require('../src/tools/doc');

function serveurFactice() {
  const outils = {};
  return { outils, registerTool: (nom, config, handler) => { outils[nom] = { config, handler }; } };
}
const lire = (reponse) => JSON.parse(reponse.content[0].text);
const base = (...reponses) => reponses.forEach((lignes) => executerLecture.mockResolvedValueOnce({ lignes }));

let s;
beforeEach(() => {
  executerLecture.mockReset();
  s = serveurFactice();
  enregistrerTousLesOutils(s);
});

describe('enregistrerTousLesOutils', () => {
  it('should register the 7 tools, all read-only', () => {
    expect(Object.keys(s.outils).sort()).toEqual([
      'composition_produit', 'compter_commandes', 'consulter_doc', 'decrire_table',
      'executer_requete_sql', 'lister_tables', 'rechercher_produit',
    ]);
    for (const { config } of Object.values(s.outils)) expect(config.annotations.readOnlyHint).toBe(true);
  });
  it('should no longer expose diagnostiquer_donnees', () => {
    expect(s.outils.diagnostiquer_donnees).toBeUndefined();
  });
});

describe('lister_tables', () => {
  it('should hide control views and credential tables, and flag obsolete ones', async () => {
    base([
      { nom: '0_verif_fact_doublon', type: 'VIEW', lignes_estimees: null, commentaire: 'VIEW' },
      { nom: 'boite_mail', type: 'BASE TABLE', lignes_estimees: '9', commentaire: '' },
      { nom: 'commande_facture', type: 'BASE TABLE', lignes_estimees: '2560', commentaire: "n'est plus utilisée" },
      { nom: 'produit_vue', type: 'VIEW', lignes_estimees: null, commentaire: 'VIEW' },
    ]);
    const res = lire(await s.outils.lister_tables.handler({}));
    expect(res.tables.map((t) => t.nom)).toEqual(['commande_facture', 'produit_vue']);
    expect(res.tables[0].attention).toMatch(/compta_facture/);
    expect(res.tables[1]).toEqual({ nom: 'produit_vue', vue: true });
  });
});

describe('decrire_table', () => {
  it('should hide secret columns and add documented joins and notes', async () => {
    base([
      { colonne: 'ID', type: 'int(11)', cle: 'PRI', commentaire: '' },
      { colonne: 'ETAT', type: 'enum(...)', cle: 'MUL', commentaire: '' },
      { colonne: 'MOTDEPASSE', type: 'varchar(50)', cle: '', commentaire: '' },
    ]);
    const res = lire(await s.outils.decrire_table.handler({ table: 'commande' }));
    expect(res.colonnes.map((c) => c.colonne)).toEqual(['ID', 'ETAT']);
    expect(res.colonnes[1].attention).toMatch(/ID_ETAT/);
    expect(res.colonnes_masquees).toMatch(/1 colonne/);
    expect(res.jointures).toContain('commande_produit.ID_COMMANDE → commande.ID');
  });
  it('should filter columns on demand', async () => {
    base([{ colonne: 'STOCK', type: 'int', cle: '' }, { colonne: 'SKU', type: 'varchar', cle: '' }]);
    const res = lire(await s.outils.decrire_table.handler({ table: 'produit', filtre_colonnes: 'stock' }));
    expect(res.colonnes.map((c) => c.colonne)).toEqual(['STOCK']);
  });
  it('should suggest real names for a wrong plural table name', async () => {
    base([], [{ nom: 'commande' }, { nom: 'commande_produit' }]);
    const res = await s.outils.decrire_table.handler({ table: 'commandes' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Tables proches : commande, commande_produit/);
    expect(executerLecture.mock.calls[1][1]).toEqual(['%commande%']);
  });
  it('should refuse credential tables without querying', async () => {
    const res = await s.outils.decrire_table.handler({ table: 'lengow_account' });
    expect(res.isError).toBe(true);
    expect(executerLecture).not.toHaveBeenCalled();
  });
});

describe('executer_requete_sql', () => {
  it('should refuse secrets without calling the database', async () => {
    const res = await s.outils.executer_requete_sql.handler({ requete: 'SELECT PASS_CLAIR FROM admin' });
    expect(res.isError).toBe(true);
    expect(executerLecture).not.toHaveBeenCalled();
  });
  it('should pass parameters through and report the added LIMIT', async () => {
    base([{ ID: 1 }]);
    const res = lire(await s.outils.executer_requete_sql.handler({ requete: 'SELECT ID FROM produit WHERE SKU = ?', parametres: ['X'] }));
    expect(executerLecture).toHaveBeenCalledWith('SELECT ID FROM produit WHERE SKU = ?\nLIMIT 200', ['X']);
    expect(res.avertissements[0]).toMatch(/LIMIT 200/);
  });
});

describe('compter_commandes', () => {
  it('should apply the stats_commandes perimeter by default', () => {
    const { sql, parametres, perimetre } = construireRequeteCommandes({ date_debut: '2026-06-01', date_fin: '2026-06-30' });
    expect(sql).toMatch(/c\.IS_FULFILLMENT = 0/);
    expect(sql).toMatch(/NOT \(c\.ID_ETAT = 10/);
    expect(sql).not.toMatch(/STATUT_SAV = ''/);
    expect(parametres).toEqual(['2026-06-01', '2026-06-30', 50]);
    expect(perimetre.join(' ')).toMatch(/SAV .* incluses/);
  });
  it('should exclude SAV orders when asked', () => {
    expect(construireRequeteCommandes({ date_debut: '2026-06-01', date_fin: '2026-06-30', inclure_sav: false }).sql)
      .toMatch(/c\.STATUT_SAV = ''/);
  });
  it('should return an error for reversed dates', async () => {
    const res = await s.outils.compter_commandes.handler({ date_debut: '2026-07-01', date_fin: '2026-06-01' });
    expect(res.isError).toBe(true);
  });
  it('should return totals and the perimeter', async () => {
    base([{ groupe: 'total', nb_commandes: '6029', dont_sav: '900', dont_annulees: '2', dont_expediees: '5900' }]);
    const res = lire(await s.outils.compter_commandes.handler({ date_debut: '2026-06-01', date_fin: '2026-06-30', regroupement: 'aucun' }));
    expect(res.total).toEqual({ nb_commandes: 6029, dont_sav: 900 });
    expect(res.detail).toBeUndefined();
  });
});

describe('rechercher_produit / composition_produit', () => {
  it('should hide archived products by default and suggest including them', async () => {
    base([]);
    const res = lire(await s.outils.rechercher_produit.handler({ texte: 'marbella' }));
    expect(executerLecture.mock.calls[0][0]).toMatch(/p\.STATUT >= 0/);
    expect(res.suggestion).toMatch(/inclure_archives/);
  });
  it('should list components in stock-out', async () => {
    base(
      [{ id: 233934, sku: 'LY-S24699 GR/DG DBLB' }],
      [{ sku: 'DOU 1/2', etat_stock: 'rupture' }, { sku: 'DOU-2/2', etat_stock: 'stock' }],
      []
    );
    const res = lire(await s.outils.composition_produit.handler({ id_produit: 233934 }));
    expect(res.composants_en_rupture).toEqual(['DOU 1/2']);
  });
  it('should require an id or a sku', async () => {
    expect((await s.outils.composition_produit.handler({})).isError).toBe(true);
  });
});

describe('consulter_doc', () => {
  it('should read the requested file from disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docs-'));
    await fs.writeFile(path.join(dir, 'kpis.md'), '# KPIs test');
    const srv = serveurFactice();
    enregistrerOutilDoc(srv, { docsDir: dir });
    const res = lire(await srv.outils.consulter_doc.handler({ sujet: 'kpis' }));
    expect(res.contenu).toBe('# KPIs test');
  });
});
