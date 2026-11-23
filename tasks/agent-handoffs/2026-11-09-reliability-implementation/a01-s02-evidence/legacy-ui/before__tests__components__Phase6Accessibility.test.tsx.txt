/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/Low confidence/)).toBeTruthy();
  });
});
