// tests/securite.test.js — garde-fous SQL (aucune base nécessaire)
const { verifierRequete, filtrerLignes } = require('../src/tools/securite');

const refuse = (sql) => expect(() => verifierRequete(sql)).toThrow();

describe('verifierRequete', () => {
  describe('accepte les lectures', () => {
    it('should accept a SELECT with explicit columns and LIMIT', () => {
      const { sql, avertissements } = verifierRequete('SELECT ID, SKU FROM produit LIMIT 5');
      expect(sql).toBe('SELECT ID, SKU FROM produit LIMIT 5');
      expect(avertissements).toEqual([]);
    });
    it('should accept COUNT(*)', () => {
      expect(() => verifierRequete('SELECT COUNT(*) FROM commande LIMIT 1')).not.toThrow();
    });
    it('should add LIMIT 200 when missing', () => {
      const { sql, avertissements } = verifierRequete('SELECT ID FROM produit');
      expect(sql).toMatch(/LIMIT 200$/);
      expect(avertissements).toHaveLength(1);
    });
    it('should accept LIMIT ? as a parameter', () => {
      expect(verifierRequete('SELECT ID FROM produit LIMIT ?').sql).not.toMatch(/LIMIT 200/);
    });
    it('should strip a trailing semicolon', () => {
      expect(verifierRequete('SELECT ID FROM produit LIMIT 1;').sql).toBe('SELECT ID FROM produit LIMIT 1');
    });
    it('should not flag forbidden words inside string literals', () => {
      expect(() => verifierRequete("SELECT ID FROM commande WHERE INFO = 'password; login' LIMIT 1")).not.toThrow();
    });
    it('should prefix a MariaDB timeout only when enabled', () => {
      expect(verifierRequete('SELECT ID FROM produit LIMIT 1').sql).not.toMatch(/SET STATEMENT/);
      expect(verifierRequete('SELECT ID FROM produit LIMIT 1', { timeoutSecondes: 15 }).sql)
        .toMatch(/^SET STATEMENT max_statement_time=15 FOR SELECT/);
    });
    it('should leave SHOW untouched', () => {
      expect(verifierRequete('SHOW TABLES').sql).toBe('SHOW TABLES');
    });
  });

  describe('refuse les écritures et le multi-instructions', () => {
    it.each([
      'UPDATE commande SET SUP = 1',
      'DELETE FROM client',
      'DROP TABLE produit',
      'SELECT ID FROM produit; DROP TABLE produit',
      "SELECT ID FROM produit INTO OUTFILE '/tmp/x'",
      'SELECT SLEEP(100)',
      'SELECT ID FROM produit LIMIT 1 FOR UPDATE',
      'SELECT /*! PASS */ ID FROM admin LIMIT 1',
    ])('should reject: %s', refuse);
  });

  describe('protège les secrets', () => {
    it.each([
      'SELECT PASS_CLAIR FROM admin LIMIT 1',
      'SELECT a.`PASS` FROM admin a LIMIT 1',
      'SELECT MOTDEPASSE FROM client LIMIT 1',
      'SELECT LOGIN, PASSWORD FROM market_place_account LIMIT 1',
      'SELECT FTP_PASS FROM logistique LIMIT 1',
      'SELECT TOKEN FROM mirakl_account LIMIT 1',
      'SELECT ID FROM lengow_account LIMIT 1',
      'SELECT * FROM client LIMIT 1',
      'SELECT c.* FROM client c LIMIT 1',
      'SELECT ID, * FROM produit LIMIT 1',
    ])('should reject: %s', refuse);

    it('should allow harmless columns sharing a prefix (DATE_PASSWORD)', () => {
      expect(() => verifierRequete('SELECT ID, DATE_PASSWORD FROM admin LIMIT 1')).not.toThrow();
    });
  });
});

describe('filtrerLignes', () => {
  it('should drop sensitive columns from results', () => {
    expect(filtrerLignes([{ ID: 1, PASS: 'x', NOM: 'a' }]).lignes).toEqual([{ ID: 1, NOM: 'a' }]);
  });
  it('should mask IBANs in string values', () => {
    const { lignes, masquees } = filtrerLignes([{ ADRESSE: 'IBAN : FR76 3000 4024 9700 0113 1542 677<br />' }]);
    expect(lignes[0].ADRESSE).toContain('[IBAN masqué]');
    expect(lignes[0].ADRESSE).not.toContain('3000 4024');
    expect(masquees).toBe(1);
  });
  it('should not mask SKUs or VAT numbers', () => {
    const valeurs = [{ sku: 'LY-S24699 GR/DG DBLB' }, { tva: 'FR29887735405' }, { sku: 'SODI184620' }];
    expect(filtrerLignes(valeurs).masquees).toBe(0);
  });
  it('should truncate beyond the limit and flag it', () => {
    const { lignes, tronque } = filtrerLignes(Array.from({ length: 250 }, (_, i) => ({ ID: i })));
    expect(lignes).toHaveLength(200);
    expect(tronque).toBe(true);
  });
});
