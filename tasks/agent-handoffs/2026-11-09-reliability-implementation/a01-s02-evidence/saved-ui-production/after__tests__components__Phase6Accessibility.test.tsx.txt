/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
} from "~/components/Accordion";
import Heatmap from "~/components/Heatmap";
import ParseView from "~/components/ParseView";
import ScoreCircle from "~/components/ScoreCircle";
import ScoreGauge from "~/components/ScoreGauge";
import { parseSim } from "~/lib/server/parseSim";
import { ParseViewSchema } from "~/lib/server/schema";

const parseView: ParseViewData = {
  totalPages: 2,
  totalLines: 4,
  contact: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: null,
    links: ["https://example.com/a-very-long-profile-link"],
    location: null,
  },
  sections: [],
  warnings: [],
  pages: [
    {
      pageNumber: 1,
      text: "Ada Lovelace\nExperience",
      lineCount: 2,
      confidence: "high",
      warnings: [],
    },
    {
      pageNumber: 2,
      text: "",
      lineCount: 0,
      confidence: "low",
      warnings: ["No extractable text was found on this page."],
    },
  ],
};

describe("Phase 6 accessible evidence controls", () => {
  it("supports keyboard accordion semantics", async () => {
    const user = userEvent.setup();
    render(
      <Accordion>
        <AccordionItem id="content">
          <AccordionHeader itemId="content">Content</AccordionHeader>
          <AccordionContent itemId="content">
            <p>Review content</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    const button = screen.getByRole("button", { name: "Content" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Review content")).toBeTruthy();
  });

  it("names scores and gives keyword evidence text beyond color", () => {
    render(
      <>
        <ScoreGauge score={72} />
        <ScoreCircle score={72} />
        <Heatmap
          jdKeywords={["TypeScript", "Kubernetes"]}
          matchedKeywords={["TypeScript"]}
          missingKeywords={["Kubernetes"]}
          uncertainKeywords={["TypeScript"]}
          keywordEvidence={[
            {
              term: "TypeScript",
              taxonomyId: "typescript",
              kind: "taxonomy",
              uncertain: true,
              job: { occurrenceCount: 1, spans: [] },
              resume: {
                occurrenceCount: 1,
                spans: [
                  {
                    start: 0,
                    end: 10,
                    text: "TypeScript",
                    alias: "TypeScript",
                  },
                ],
              },
            },
          ]}
        />
      </>,
    );

    expect(
      screen
        .getByRole("progressbar", { name: "Resume score" })
        .getAttribute("aria-valuenow"),
    ).toBe("72");
    expect(
      screen.getByRole("img", { name: "Resume score 72 out of 100" }),
    ).toBeTruthy();
    expect(screen.getByText("Uncertain evidence")).toBeTruthy();
    expect(screen.getByText(/Evidence: “TypeScript”/)).toBeTruthy();
    expect(screen.getByText("Missing from resume")).toBeTruthy();
  });

  it.each(["high", "medium", "low"] as const)(
    "labels the stored %s count band as text availability with reliability unassessed",
    (confidence) => {
      const { container, unmount } = render(
        <ParseView
          parseView={{
            ...parseView,
            pages: [{ ...parseView.pages[0], confidence }],
          }}
          imageUrl=""
        />,
      );
      try {
        expect(
          screen.getByText(
            `${confidence[0].toUpperCase() + confidence.slice(1)} text availability`,
          ),
        ).toBeTruthy();
        expect(
          screen.getByText(/Reliability and accuracy are unassessed\./),
        ).toBeTruthy();
        expect(container.textContent).not.toMatch(
          /\b(?:high|medium|low) confidence\b/iu,
        );
        expect(
          container.querySelector(`.parse-confidence.is-${confidence}`),
        ).toBeTruthy();
      } finally {
        unmount();
      }
    },
  );

  it("bounds an empty warning list to recorded warnings without assuring page reliability", () => {
    const { unmount } = render(<ParseView parseView={parseView} imageUrl="" />);
    try {
      expect(
        screen.getByText(
          "No additional page warnings were recorded. Page reliability and accuracy remain unassessed.",
        ),
      ).toBeTruthy();
      expect(
        screen.queryByText("No page-specific limitations detected."),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  it.each([
    ["", "No text was found in this saved group."],
    ["abc", "Little text was found in this saved group."],
    [
      "\uFFFD".repeat(8),
      "Saved extracted text contains a replacement character. Compare it with your PDF.",
    ],
    [
      "abcdefgh\uD800",
      "Saved extracted text contains an invalid character sequence. Compare it with your PDF.",
    ],
    [
      "abcdefgh\u0001",
      "Saved extracted text contains an unexpected control character. Compare it with your PDF.",
    ],
  ])(
    "shows saved-text review observations from real parser output %#",
    (text, label) => {
      const saved = parseSim({ text, totalPages: 1, pageTexts: [text] });
      const before = structuredClone(saved);
      const { unmount } = render(<ParseView parseView={saved} imageUrl="" />);
      try {
        const observations = screen.getByRole("region", {
          name: "Observations from saved text",
        });
        expect(within(observations).getByText(label)).toBeTruthy();
        expect(observations.textContent).toContain(
          "Original PDF page boundaries and whether text came from the PDF or OCR are unverified.",
        );
        expect(observations.textContent).toContain(
          "Extraction reliability and accuracy remain unassessed.",
        );
        expect(observations.textContent).not.toMatch(
          /UTF-16|threshold|modelVersion/u,
        );
        for (const warning of saved.pages[0].warnings)
          expect(screen.getByText(warning)).toBeTruthy();
        expect(saved).toEqual(before);
      } finally {
        unmount();
      }
    },
  );

  it("observes identical real saved-text groups without claiming duplicate PDF pages", () => {
    const text = "SAVED_TEXT_SENTINEL <script>synthetic_marker</script>";
    const saved = parseSim({
      text: `${text}\n\n${text}`,
      totalPages: 2,
      pageTexts: [text, text],
    });
    expect(saved.pages.every((page) => page.warnings.length === 0)).toBe(true);
    const before = structuredClone(saved);
    const { container, unmount } = render(
      <ParseView parseView={saved} imageUrl="" />,
    );
    try {
      const observations = screen.getByRole("region", {
        name: "Observations from saved text",
      });
      expect(
        within(observations).getByText(
          "Identical text appears in another saved text group. Compare both groups with your PDF.",
        ),
      ).toBeTruthy();
      expect(
        within(observations).getByText("Matching saved text groups: 2."),
      ).toBeTruthy();
      expect(observations.textContent).not.toContain("SAVED_TEXT_SENTINEL");
      expect(observations.textContent).not.toContain("synthetic_marker");
      expect(observations.textContent).not.toMatch(
        /duplicate PDF|native text detected/iu,
      );
      expect(container.querySelector("script")).toBeNull();
      fireEvent.change(screen.getByRole("combobox", { name: "Parse page" }), {
        target: { value: "2" },
      });
      expect(
        within(observations).getByText("Matching saved text groups: 1."),
      ).toBeTruthy();
      expect(saved).toEqual(before);
    } finally {
      unmount();
    }
  });

  it.each(["missing", "count_mismatch", "nonsequential", "unsupported_bounds"])(
    "withholds derived saved-text reasons for %s metadata and never scans fallback pages",
    (kind) => {
      const saved = parseSim({
        text: "\uFFFD".repeat(8),
        totalPages: 1,
        pageTexts: ["\uFFFD".repeat(8)],
      });
      if (kind === "missing") {
        saved.pages = [];
        saved.totalPages = 2;
      } else if (kind === "count_mismatch") saved.totalPages = 2;
      else if (kind === "nonsequential") {
        saved.pages.push({ ...saved.pages[0], pageNumber: 3 });
        saved.totalPages = 2;
      } else {
        saved.pages = Array.from({ length: 21 }, (_, index) => ({
          ...saved.pages[0],
          pageNumber: index + 1,
        }));
        saved.totalPages = 21;
      }
      const before = structuredClone(saved);
      const { unmount } = render(<ParseView parseView={saved} imageUrl="" />);
      try {
        const observations = screen.getByRole("region", {
          name: "Observations from saved text",
        });
        expect(
          within(observations).getByText(
            "Observations from saved text are unavailable. Compare the saved text with your PDF.",
          ),
        ).toBeTruthy();
        expect(within(observations).queryByRole("list")).toBeNull();
        expect(observations.textContent).not.toContain("No text was found");
        expect(observations.textContent).not.toContain("replacement character");
        expect(observations.textContent).not.toContain(
          "Matching saved text groups",
        );
        if (kind === "missing") {
          expect(
            screen.getByText(
              "Per-page extraction evidence is unavailable for this saved result.",
            ),
          ).toBeTruthy();
          expect(screen.getAllByRole("option")).toHaveLength(2);
        }
        expect(saved).toEqual(before);
      } finally {
        unmount();
      }
    },
  );

  it("keeps recorded saved-page warnings and an empty reason list unassessed", () => {
    const text = "Ordinary saved synthetic extracted text";
    const saved = parseSim({ text, totalPages: 1, pageTexts: [text] });
    saved.pages[0].warnings = ["Synthetic recorded page warning."];
    const before = structuredClone(saved);
    const { unmount } = render(<ParseView parseView={saved} imageUrl="" />);
    try {
      const observations = screen.getByRole("region", {
        name: "Observations from saved text",
      });
      expect(
        within(observations).getByText(
          "No listed review reasons were found in this saved text group. Extraction reliability and accuracy remain unassessed.",
        ),
      ).toBeTruthy();
      expect(screen.getByText("Synthetic recorded page warning.")).toBeTruthy();
      expect(observations.textContent).not.toMatch(
        /accurate extraction|no limitations/iu,
      );
      expect(saved).toEqual(before);
    } finally {
      unmount();
    }
  });

  it("bounds the saved-page fallback for a schema-valid oversized declared page count", () => {
    const saved = ParseViewSchema.parse({
      ...parseView,
      totalPages: 2 ** 32,
      pages: [],
    });
    const before = structuredClone(saved);
    const { unmount } = render(<ParseView parseView={saved} imageUrl="" />);
    try {
      expect(screen.getAllByRole("option")).toHaveLength(1);
      const observations = screen.getByRole("region", {
        name: "Observations from saved text",
      });
      expect(
        within(observations).getByText(
          "Observations from saved text are unavailable. Compare the saved text with your PDF.",
        ),
      ).toBeTruthy();
      expect(within(observations).queryByRole("list")).toBeNull();
      expect(observations.textContent).not.toContain("No text was found");
      expect(saved).toEqual(before);
    } finally {
      unmount();
    }
  });

  it("lets a reader select each parse page and see its limitations", () => {
    render(<ParseView parseView={parseView} imageUrl="" imageUrls={[]} />);
    expect(screen.getByRole("combobox", { name: "Parse page" })).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Parse page" }), {
      target: { value: "2" },
    });
    expect(
      screen.getByText("No extractable text was found on this page."),
    ).toBeTruthy();
    expect(screen.getByText(/Low text availability/)).toBeTruthy();
  });
});
