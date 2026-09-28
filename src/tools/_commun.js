// src/tools/_commun.js — constantes partagées (les réponses passent par ./reponse)
const { z } = require('zod');

// Tous les outils Negolux sont en lecture seule
const LECTURE_SEULE = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const DATE_JOUR = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ');

// Refus « métier » : message destiné au modèle, pas une panne
class RefusOutil extends Error {}

module.exports = { LECTURE_SEULE, DATE_JOUR, RefusOutil };
