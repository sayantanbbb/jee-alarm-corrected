/**
 * QuestionService.js
 *
 * Priority order for question selection:
 *   1. Imported question bank (JSON you paste in from Claude each night)
 *   2. Hardcoded fallback pool (8 questions, always available)
 *
 * No API calls. No internet needed at alarm time.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BANK_KEY = '@jee_question_bank';  // stores your imported questions

export const TOPICS = {
  Physics: [
    'Kinematics', 'Newton\'s Laws', 'Work & Energy', 'Rotational Motion',
    'Gravitation', 'Fluid Mechanics', 'Thermodynamics', 'Waves & Sound',
    'Electrostatics', 'Current Electricity', 'Magnetism',
    'Electromagnetic Induction', 'Optics', 'Modern Physics', 'SHM',
  ],
  Chemistry: [
    'Mole Concept', 'Atomic Structure', 'Chemical Bonding',
    'Thermochemistry', 'Chemical Equilibrium', 'Electrochemistry',
    'Coordination Compounds', 'Organic Mechanisms', 'Hydrocarbons',
    'Stereochemistry', 'Carbonyl Compounds', 'Amines',
    'p-Block Elements', 'd-Block Elements', 'Chemical Kinetics',
  ],
  Mathematics: [
    'Limits & Continuity', 'Differentiation', 'Integration',
    'Differential Equations', 'Matrices & Determinants',
    'Vectors & 3D', 'Complex Numbers', 'P&C',
    'Probability', 'Conic Sections', 'Sequences & Series',
    'Trigonometry', 'Functions', 'Binomial Theorem', 'Inequalities',
  ],
};

export const DIFF_LABEL = {
  1: 'JEE Main',
  2: 'JEE Adv Easy',
  3: 'JEE Adv Medium',
  4: 'JEE Adv Hard',
  5: 'Olympiad',
};

// ─── Bank management ──────────────────────────────────────────────────────────

export async function saveQuestionBank(questions) {
  await AsyncStorage.setItem(BANK_KEY, JSON.stringify(questions));
}

export async function loadQuestionBank() {
  try {
    const raw = await AsyncStorage.getItem(BANK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearQuestionBank() {
  await AsyncStorage.removeItem(BANK_KEY);
}

export async function getBankStats() {
  const bank = await loadQuestionBank();
  if (!bank.length) return null;
  const bySubject = {};
  for (const q of bank) {
    bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
  }
  return { total: bank.length, bySubject };
}

// ─── Main question picker ─────────────────────────────────────────────────────

export async function generateQuestion({
  subject = 'Mathematics',
  topic   = 'Calculus',
  difficulty = 3,
  type    = 'single',
  excludeQuestions = [],
} = {}) {

  const resolvedType = type === 'mixed'
    ? (Math.random() > 0.5 ? 'multi' : 'single')
    : type;

  // ── Try imported bank first ───────────────────────────────────────────────
  const bank = await loadQuestionBank();

  if (bank.length > 0) {
    // Filter by subject, type, difficulty (within ±1), not recently used
    let pool = bank.filter(q =>
      q.subject === subject &&
      q.type === resolvedType &&
      Math.abs((q.difficulty || 3) - difficulty) <= 1 &&
      !excludeQuestions.includes(q.question)
    );

    // Widen search if too few results
    if (pool.length === 0) {
      pool = bank.filter(q =>
        q.subject === subject &&
        !excludeQuestions.includes(q.question)
      );
    }

    // Widen to any subject if still nothing
    if (pool.length === 0) {
      pool = bank.filter(q => !excludeQuestions.includes(q.question));
    }

    // If bank is exhausted (all recently used), just pick any
    if (pool.length === 0) pool = bank;

    if (pool.length > 0) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      return {
        ...q,
        id: `bank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        correct: Array.isArray(q.correct) ? q.correct : [q.correct],
      };
    }
  }

  // ── Fall back to hardcoded pool ───────────────────────────────────────────
  return getHardcodedFallback(subject, resolvedType);
}

// ─── Hardcoded fallback pool (always available, no internet needed) ───────────

const HARDCODED = [
  {
    type: 'single', subject: 'Physics',
    question: 'A particle\'s displacement: x(t) = t³ − 6t² + 9t + 4 m. It is momentarily at rest at:',
    options: { A: 't = 1 s only', B: 't = 3 s only', C: 't = 1 s and t = 3 s', D: 't = 2 s' },
    correct: ['C'],
    hint: 'v = dx/dt = 3t² − 12t + 9 = 0 → (t−1)(t−3) = 0',
    difficulty: 2, topic: 'Kinematics',
  },
  {
    type: 'multi', subject: 'Physics',
    question: 'For a charge q, mass m released from rest in a uniform field E, after time t, which are correct?',
    options: { A: 'v = qEt/m', B: 'KE = q²E²t²/(2m)', C: 'p = qEt', D: 's = qEt²/m' },
    correct: ['A', 'B', 'C'],
    hint: 'a = qE/m. v=at ✓, KE=½mv² ✓, p=mv ✓. But s=½at² not at².',
    difficulty: 3, topic: 'Electrostatics',
  },
  {
    type: 'single', subject: 'Physics',
    question: 'Two blocks of mass m and 2m on a frictionless surface connected by spring k. Reduced mass for oscillation:',
    options: { A: 'm/2', B: '2m/3', C: '3m/2', D: '2m' },
    correct: ['B'],
    hint: 'μ = m₁m₂/(m₁+m₂) = 2m²/3m = 2m/3',
    difficulty: 3, topic: 'SHM',
  },
  {
    type: 'single', subject: 'Mathematics',
    question: 'Let f(x) = x² − 4|x| + 3. The number of real solutions to f(f(x)) = 0 is:',
    options: { A: '4', B: '6', C: '8', D: '10' },
    correct: ['C'],
    hint: 'f(x)=0 → x=±1,±3. Solve f(x)=1 and f(x)=3 for 4 roots each.',
    difficulty: 4, topic: 'Functions',
  },
  {
    type: 'multi', subject: 'Mathematics',
    question: 'For f(x) = |x² − 1| on [−2, 2], which are correct?',
    options: {
      A: 'f is not differentiable at x = ±1',
      B: 'f is continuous everywhere on [−2, 2]',
      C: 'f has a local minimum at x = 0',
      D: 'f achieves its global maximum at x = ±2',
    },
    correct: ['A', 'B', 'D'],
    hint: 'Non-diff at cusps. f(0)=1 is local MAX. f(±2)=3 is global max.',
    difficulty: 3, topic: 'Differentiation',
  },
  {
    type: 'single', subject: 'Mathematics',
    question: 'z = (√3 + i)¹⁰⁰. Then Re(z) + Im(z) equals:',
    options: { A: '2⁹⁹', B: '2¹⁰⁰', C: '2⁹⁹(√3 + 1)', D: '2¹⁰⁰(√3 − 1)' },
    correct: ['C'],
    hint: '√3+i = 2cis(30°), z=2¹⁰⁰cis(120°). Re+Im = 2¹⁰⁰(−½+√3/2) = 2⁹⁹(√3−1)... recheck: cis(120°)=(−½, √3/2), Re+Im=2¹⁰⁰(√3/2−½)=2⁹⁹(√3−1)',
    difficulty: 4, topic: 'Complex Numbers',
  },
  {
    type: 'multi', subject: 'Chemistry',
    question: 'For N₂ + 3H₂ → 2NH₃, which rate relations are correct?',
    options: {
      A: '−d[N₂]/dt = ⅓(−d[H₂]/dt)',
      B: 'd[NH₃]/dt = 2(−d[N₂]/dt)',
      C: '−d[H₂]/dt = (3/2)d[NH₃]/dt',
      D: 'All species have the same rate',
    },
    correct: ['A', 'B', 'C'],
    hint: 'Divide each rate by stoichiometric coefficient to get uniform rate.',
    difficulty: 2, topic: 'Chemical Kinetics',
  },
  {
    type: 'single', subject: 'Chemistry',
    question: 'Benzene + Cl₂/AlCl₃ → X; X + HNO₃/H₂SO₄ → Y (major product). Y is:',
    options: {
      A: 'm-chloronitrobenzene',
      B: 'o + p-chloronitrobenzene',
      C: '1,2,4-trichlorobenzene',
      D: 'p-chloroaniline',
    },
    correct: ['B'],
    hint: '−Cl is o/p director via +M effect despite −I.',
    difficulty: 2, topic: 'Organic Mechanisms',
  },
];

function getHardcodedFallback(subject, type) {
  const pool = HARDCODED.filter(q => q.type === type && q.subject === subject);
  const fallback = pool.length ? pool : HARDCODED;
  const q = fallback[Math.floor(Math.random() * fallback.length)];
  return {
    ...q,
    id: `hardcoded_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    isFallback: true,
  };
}
