/** Motivational lines — one is picked at random on every app open (README §3). */
export const QUOTES: { text: string; author: string }[] = [
  { text: "Small progress is still progress.", author: "ChallengeMate" },
  { text: "You don't need motivation. You need consistency.", author: "ChallengeMate" },
  { text: "One more day. Keep the streak alive! 🔥", author: "ChallengeMate" },
  { text: "Discipline is choosing what you want most over what you want now.", author: "Abraham Lincoln" },
  { text: "A river cuts through rock not because of its power, but its persistence.", author: "James N. Watkins" },
  { text: "Show up on the days you don't feel like it — that's where streaks are built.", author: "ChallengeMate" },
  { text: "Read a little every day, and the pages will take care of themselves.", author: "ChallengeMate" },
  { text: "You are one day away from a different trajectory.", author: "ChallengeMate" },
  { text: "The streak isn't the goal. The person you become is.", author: "ChallengeMate" },
  { text: "Miss once, never twice.", author: "ChallengeMate" },
  { text: "Motivation gets you started. Habit keeps you going.", author: "Jim Ryun" },
  { text: "Future you is watching. Make them proud.", author: "ChallengeMate" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Thirty minutes today beats ten hours someday.", author: "ChallengeMate" },
];

export const randomQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];
