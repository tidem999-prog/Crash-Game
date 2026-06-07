/**
 * Mathematical Simulation Script for Crash Game House Edge Audit
 * Runs 10,000 trials of the multiplier generator to verify the 5% house edge.
 */

const generateGameResult = () => {
  const houseEdge = 0.05; // 5% house edge
  const random = Math.random();
  // Formula: multiplier = 0.95 / (1 - random)
  const multiplier = 0.95 / (1 - random);
  // Cap at 100.00x as per security limits in user guide
  return Math.min(parseFloat(multiplier.toFixed(2)), 100.00);
};

const runSimulation = (trials = 10000) => {
  console.log(`===================================================`);
  console.log(`AUDIT DU MOTEUR DE JEU : SIMULATION DE ${trials} PARTIES`);
  console.log(`===================================================`);

  let sumMultipliers = 0;
  let minMultiplier = Infinity;
  let maxMultiplier = -Infinity;
  
  let instantCrashes = 0; // crashes under 1.00x (which means player loses automatically)
  let underTwo = 0;       // crashes < 2.00x
  let highMultipliers = 0; // crashes >= 10.00x
  let cappedMultipliers = 0; // hit exactly 100.00x

  for (let i = 0; i < trials; i++) {
    const res = generateGameResult();
    
    sumMultipliers += res;
    if (res < minMultiplier) minMultiplier = res;
    if (res > maxMultiplier) maxMultiplier = res;

    if (res < 1.00) instantCrashes++;
    if (res < 2.00) underTwo++;
    if (res >= 10.00) highMultipliers++;
    if (res >= 100.00) cappedMultipliers++;
  }

  const average = sumMultipliers / trials;
  
  console.log(`RÉSULTATS DE L'AUDIT :`);
  console.log(`- Multiplicateur Moyen : ${average.toFixed(2)}x`);
  console.log(`- Multiplicateur Minimal constaté : ${minMultiplier.toFixed(2)}x`);
  console.log(`- Multiplicateur Maximal constaté : ${maxMultiplier.toFixed(2)}x`);
  console.log(`- Taux de Crash Instantané (< 1.00x) : ${((instantCrashes / trials) * 100).toFixed(2)}%`);
  console.log(`- Taux de Crash sous la barre 2.00x : ${((underTwo / trials) * 100).toFixed(2)}%`);
  console.log(`- Taux de Gros Multiplicateurs (>= 10.00x) : ${((highMultipliers / trials) * 100).toFixed(2)}%`);
  console.log(`- Fréquence de plafonnement maximal (100.00x) : ${((cappedMultipliers / trials) * 100).toFixed(2)}%`);
  
  // Theoretical House Edge calculation based on RTP:
  // Standard Crash game RTP is roughly: 1 - House Edge = 95%
  // An instant crash rate < 1.00x represents the primary mechanism for house edge:
  // Math: 1 - 0.95 = 5% of games crash instantly (actually between 0.95 and 1.00, meaning multiplier generated is < 1.00).
  // Let's print out if it conforms.
  console.log(`\nANALYSE DU HOUSE EDGE :`);
  console.log(`- Seuil théorique de perte immédiate : 5.00%`);
  console.log(`- Seuil constaté de perte immédiate (crés < 1.00x) : ${((instantCrashes / trials) * 100).toFixed(2)}%`);
  
  if (Math.abs((instantCrashes / trials) - 0.05) < 0.01) {
    console.log(`-> STATUT AUDIT : CONFORME ✅ (Le House Edge de 5% est respecté)`);
  } else {
    console.log(`-> STATUT AUDIT : ANOMALIE STATISTIQUE ⚠️ (Écart anormal, vérifiez les lois probabilistes)`);
  }
  console.log(`===================================================`);
};

runSimulation();
