import { useEffect, useState } from "react";
import {
  applyThemePreference,
  normalizeThemePreference,
  readThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "~/lib/theme";

const themeLabels: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ThemeControl = () => {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const storedPreference = readThemePreference();
    setPreference(storedPreference);
    applyThemePreference(storedPreference);

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const applySystemChange = () => {
      if (
        normalizeThemePreference(
          document.documentElement.dataset.themePreference,
        ) === "system"
      ) {
        applyThemePreference("system");
      }
    };
    media?.addEventListener("change", applySystemChange);
    return () => media?.removeEventListener("change", applySystemChange);
  }, []);

  return (
    <label className="theme-control" title="Choose color theme">
      <span aria-hidden="true" className="theme-control-icon">
        ◐
      </span>
      <span className="sr-only">Color theme</span>
      <select
        name="color-theme"
        aria-label="Color theme"
        value={preference}
        onChange={(event) => {
          const nextPreference = normalizeThemePreference(event.target.value);
          setPreference(nextPreference);
          storeThemePreference(nextPreference);
          applyThemePreference(nextPreference);
        }}
      >
        {(Object.keys(themeLabels) as ThemePreference[]).map((theme) => (
          <option key={theme} value={theme}>
            {themeLabels[theme]}
          </option>
        ))}
      </select>
    </label>
  );
};

export default ThemeControl;
