import classic from "./build-templates/classic.tex?raw";
import compact from "./build-templates/compact.tex?raw";
import splitHeader from "./build-templates/split-header.tex?raw";
import {
  getLatexExample,
  LATEX_EXAMPLES,
  type LatexProfile,
} from "./latex-converter";

export type BuildTemplate = {
  id: string;
  name: string;
  description: string;
  preview: string;
  source: () => string;
};
// Every template here compiles on the qualified image (tasks/agent-handoffs/build-experience).
export const BUILD_TEMPLATES: readonly BuildTemplate[] = [
  {
    id: "classic",
    name: "Classic one-page",
    description:
      "Single column with ruled sections. Based on Jake's Resume (MIT).",
    preview: "/build-templates/classic.png",
    source: () => classic,
  },
  {
    id: "compact",
    name: "Compact",
    description:
      "Name and contacts in one header row. Based on sb2nov/resume (MIT).",
    preview: "/build-templates/compact.png",
    source: () => compact,
  },
  {
    id: "split-header",
    name: "Split header",
    description: "Contacts in a two-column table above simple bullet sections.",
    preview: "/build-templates/split-header.png",
    source: () => splitHeader,
  },
  ...LATEX_EXAMPLES.map((example) => ({
    id: example.id,
    name: example.label,
    description: example.description,
    preview: `/build-templates/${example.id}.png`,
    source: () => getLatexExample(example.id as LatexProfile, "A4"),
  })),
];
