import { Homepage } from "../hw-helper-home/Homepage";

export function Red() {
  return (
    <div className="hw-theme hw-theme-red">
      <style>{`
        .hw-theme-red .hw-home {
          --night: #201113;
          --panel: #2c191c;
          --panel-hi: #3a2125;
          --line: rgba(252, 226, 226, .12);
          --ink: #f8eeee;
          --soft: #d7bfc1;
          --quiet: #b49a9d;
          --mint: #ed918d;
          --mint-dark: #3c1a1e;
          --accent-rgb: 237, 145, 141;
          --ink-rgb: 248, 238, 238;
          --on-accent: #341619;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
