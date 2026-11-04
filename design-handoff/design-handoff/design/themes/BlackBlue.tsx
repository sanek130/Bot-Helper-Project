import { Homepage } from "../hw-helper-home/Homepage";

export function BlackBlue() {
  return (
    <div className="hw-theme hw-theme-black-blue">
      <style>{`
        .hw-theme-black-blue .hw-home {
          --night: #080d17;
          --panel: #10192a;
          --panel-hi: #17243b;
          --line: rgba(214, 227, 250, .11);
          --ink: #f0f4fd;
          --soft: #b4c1d8;
          --quiet: #91a1bc;
          --mint: #7ba8ff;
          --mint-dark: #14284b;
          --accent-rgb: 123, 168, 255;
          --ink-rgb: 240, 244, 253;
          --on-accent: #091326;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
