#!/usr/bin/env node
// Majles helper: draws blind labels and counts the Borda vote, so the orchestrating model
// never has to shuffle or do arithmetic itself. No dependencies; Node 18+.
//
//   node council.mjs assign <role-id> <role-id> ...
//     -> {"labels":{"A":"skeptic",...},"reviewOrders":{"skeptic":["D","B",...],...}}
//        Labels are a random permutation. Each review order is a fresh random order of the
//        OTHER answers (a role never reviews its own answer in full mode).
//
//   node council.mjs tally < input.json
//     input: {"labels":{"A":"skeptic",...},
//             "reviews":[{"reviewer":"skeptic","ranking":["C","A","E","B"]}, ...],
//             "closeRace":0.1}            // optional, default 0.1
//     A reviewer's own answer is dropped from its ranking before counting (needed in standard
//     mode, where one panel ranks all answers once per role lens). Invalid reviews are skipped
//     and reported, never guessed at.

import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LETTERS = "ABCDEFGHIJ";

export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function assign(roles) {
  if (roles.length < 2 || roles.length > LETTERS.length) {
    throw new Error(`assign needs 2 to ${LETTERS.length} roles, got ${roles.length}`);
  }
  if (new Set(roles).size !== roles.length) throw new Error("assign got duplicate roles");
  const shuffled = shuffle(roles);
  const labels = {};
  shuffled.forEach((role, i) => (labels[LETTERS[i]] = role));
  const reviewOrders = {};
  for (const role of roles) {
    reviewOrders[role] = shuffle(Object.keys(labels).filter((l) => labels[l] !== role));
  }
  return { labels, reviewOrders };
}

export function tally({ labels, reviews, closeRace = 0.1 }) {
  if (!labels || typeof labels !== "object") throw new Error("tally input needs a labels object");
  if (!Array.isArray(reviews)) throw new Error("tally input needs a reviews array");
  const allLabels = Object.keys(labels);
  const roleToLabel = Object.fromEntries(allLabels.map((l) => [labels[l], l]));
  const points = Object.fromEntries(allLabels.map((l) => [l, 0]));
  const max = Object.fromEntries(allLabels.map((l) => [l, 0]));
  const skipped = [];
  let counted = 0;

  for (const review of reviews) {
    const who = review?.reviewer ?? "(unnamed)";
    const ranking = review?.ranking;
    if (!Array.isArray(ranking)) {
      skipped.push({ reviewer: who, reason: "ranking is not an array" });
      continue;
    }
    const own = roleToLabel[who];
    const items = ranking.filter((l) => l !== own);
    const expected = allLabels.filter((l) => l !== own);
    const unknown = items.filter((l) => !allLabels.includes(l));
    if (unknown.length) {
      skipped.push({ reviewer: who, reason: `unknown labels: ${unknown.join(", ")}` });
      continue;
    }
    if (new Set(items).size !== items.length || items.length !== expected.length) {
      skipped.push({ reviewer: who, reason: `must rank each of ${expected.join(", ")} exactly once` });
      continue;
    }
    const n = items.length;
    items.forEach((label, i) => {
      points[label] += n - 1 - i;
      max[label] += n - 1;
    });
    counted++;
  }

  const entries = allLabels
    .map((label) => ({
      label,
      role: labels[label],
      points: points[label],
      maxPossible: max[label],
      fraction: max[label] > 0 ? Number((points[label] / max[label]).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.fraction - a.fraction || b.points - a.points);

  const [first, second] = entries;
  if (counted === 0 || !first || !second || first.maxPossible === 0) {
    return { entries, winner: null, runnerUp: null, margin: 0, closeRace: true, tie: true, counted, skipped,
      note: "No valid reviews: the chairman decides without a vote." };
  }
  const margin = Number((first.fraction - second.fraction).toFixed(4));
  const tie = Math.abs(margin) < 1e-9;
  return {
    entries,
    winner: tie ? null : first.label,
    runnerUp: second.label,
    margin,
    closeRace: tie || margin <= closeRace + 1e-9,
    tie,
    counted,
    skipped,
  };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "assign") return assign(rest);
  if (cmd === "tally") return tally(JSON.parse(readFileSync(0, "utf8")));
  throw new Error("usage: council.mjs assign <role...> | council.mjs tally < input.json");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (err) {
    console.error(`council.mjs: ${err.message}`);
    process.exit(1);
  }
}
