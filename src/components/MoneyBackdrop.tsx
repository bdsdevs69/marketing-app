// Ambient money layer behind the whole app: a giant "$" watermark and gold coins
// drifting upwards, matching the portal's hero. Purely decorative.
//
// The coin values are a fixed table rather than Math.random() so the server and
// client render identically (random values would cause a hydration mismatch).

type Coin = {
  left: number; // %
  size: number; // px
  drift: number; // px, horizontal wander
  dur: number; // s
  delay: number; // s
  glyph: string;
};

const COINS: Coin[] = [
  { left: 4, size: 26, drift: 34, dur: 20, delay: 0, glyph: "$" },
  { left: 12, size: 16, drift: -22, dur: 26, delay: 3.5, glyph: "$" },
  { left: 19, size: 32, drift: 28, dur: 23, delay: 7, glyph: "$" },
  { left: 27, size: 14, drift: -30, dur: 29, delay: 1.5, glyph: "$" },
  { left: 35, size: 22, drift: 20, dur: 21, delay: 9.5, glyph: "$" },
  { left: 43, size: 30, drift: -26, dur: 25, delay: 5 , glyph: "$" },
  { left: 51, size: 18, drift: 32, dur: 28, delay: 12, glyph: "$" },
  { left: 59, size: 24, drift: -18, dur: 22, delay: 2.5, glyph: "$" },
  { left: 67, size: 34, drift: 24, dur: 27, delay: 8.5, glyph: "$" },
  { left: 74, size: 15, drift: -34, dur: 24, delay: 14, glyph: "$" },
  { left: 81, size: 28, drift: 18, dur: 30, delay: 4, glyph: "$" },
  { left: 88, size: 20, drift: -24, dur: 23, delay: 11, glyph: "$" },
  { left: 94, size: 25, drift: 30, dur: 26, delay: 6.5, glyph: "$" },
  { left: 98, size: 17, drift: -20, dur: 31, delay: 16, glyph: "$" },
];

export default function MoneyBackdrop() {
  return (
    <div className="money-backdrop" aria-hidden="true">
      <span className="money-watermark">$</span>
      <div className="money-coins">
        {COINS.map((c, i) => (
          <span
            key={i}
            className="money-coin"
            style={
              {
                left: `${c.left}%`,
                ["--size" as string]: `${c.size}px`,
                ["--drift" as string]: `${c.drift}px`,
                ["--dur" as string]: `${c.dur}s`,
                ["--delay" as string]: `${c.delay}s`,
              } as React.CSSProperties
            }
          >
            {c.glyph}
          </span>
        ))}
      </div>
    </div>
  );
}
