import { Homepage } from "../hw-helper-home/Homepage";

export function Light() {
  return (
    <div className="hw-theme hw-theme-light">
      <style>{`
        .hw-theme-light .hw-home {
          --night: #f2f5ef;
          --panel: #fbfcf8;
          --panel-hi: #e7ece4;
          --line: rgba(36, 57, 43, .13);
          --ink: #243129;
          --soft: #58675d;
          --quiet: #6d786f;
          --mint: #34764e;
          --mint-dark: #e5f0e6;
          --accent-rgb: 52, 118, 78;
          --ink-rgb: 36, 49, 41;
          --on-accent: #f8fff8;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
