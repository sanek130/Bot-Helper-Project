import { Homepage } from "../hw-helper-home/Homepage";

export function Beige() {
  return (
    <div className="hw-theme hw-theme-beige">
      <style>{`
        .hw-theme-beige .hw-home {
          --night: #f1e7d8;
          --panel: #fbf6ed;
          --panel-hi: #e9dccb;
          --line: rgba(69, 53, 40, .15);
          --ink: #382e25;
          --soft: #6f6052;
          --quiet: #776858;
          --mint: #a9513b;
          --mint-dark: #f4e3d8;
          --accent-rgb: 169, 81, 59;
          --ink-rgb: 56, 46, 37;
          --on-accent: #fff8f2;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
