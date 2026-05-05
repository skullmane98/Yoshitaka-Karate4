// Yoshitaka Karate-Do — Shotokan belt ranking system.
// Source of truth for belt order, color swatches, and progression logic.
// Used by:
//   - AdminDashboard (belt edit dropdown)
//   - StudentDashboard (current → next belt card)
//   - IDCard (stripe color)
//   - Public schedule + about pages

export const BELTS = [
  { name: "No Belt", color: "#E8E5DD", text: "#4A4A4A" },
  { name: "White", color: "#FFFFFF", text: "#0F0F0F" },
  { name: "Purple-White", color: "#7E57C2", text: "#FFFFFF", stripe: "#FFFFFF" },
  { name: "Yellow-White", color: "#F4C542", text: "#0F0F0F", stripe: "#FFFFFF" },
  { name: "Yellow", color: "#F4C542", text: "#0F0F0F" },
  { name: "Green", color: "#2E7D5B", text: "#FFFFFF" },
  { name: "Blue", color: "#1E5BA8", text: "#FFFFFF" },
  { name: "Brown", color: "#5D3A1A", text: "#FFFFFF" },
  { name: "Black 1st Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 2nd Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 3rd Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 4th Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 5th Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 6th Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 7th Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 8th Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 9th Degree", color: "#0F0F0F", text: "#D7263D" },
  { name: "Black 10th Degree", color: "#0F0F0F", text: "#D7263D" },
];

export const BELT_NAMES = BELTS.map((b) => b.name);

export function getBelt(name) {
  if (!name) return BELTS[0];
  return BELTS.find((b) => b.name === name) || BELTS[0];
}

export function getNextBelt(currentName) {
  const idx = BELTS.findIndex((b) => b.name === currentName);
  if (idx === -1) return BELTS[1]; // unknown → next is White
  if (idx >= BELTS.length - 1) return null; // at top, no next
  return BELTS[idx + 1];
}

export function getBeltProgress(currentName) {
  const idx = BELTS.findIndex((b) => b.name === currentName);
  if (idx === -1) return { current: 0, total: BELTS.length };
  return { current: idx + 1, total: BELTS.length };
}
