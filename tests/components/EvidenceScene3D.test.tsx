/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BrandLockup from "../../app/components/BrandLockup";
import EvidenceScene3D from "../../app/components/EvidenceScene3D";

afterEach(cleanup);

describe("EvidenceScene3D", () => {
  it("contains no fabricated measurements on a saved result", () => {
    const { container } = render(
      <EvidenceScene3D variant="result" label="Evidence layers" />,
    );
    expect(container.textContent).toBe("SourceEvidence");
    expect(container.querySelector(".scene-score-orb")).toBeNull();
  });
  it("renders route-specific, accessible 3D content", () => {
    render(
      <EvidenceScene3D variant="privacy" label="Private resume data vault" />,
    );

    expect(
      screen.getByRole("img", { name: "Private resume data vault" }),
    ).toBeTruthy();
    expect(screen.getByText("Export")).toBeTruthy();
    expect(screen.getByText("Control")).toBeTruthy();
  });

  it("responds to pointer position and resets when the pointer leaves", () => {
    render(<EvidenceScene3D variant="hero" label="Interactive evidence" />);
    const scene = screen.getByRole("img", { name: "Interactive evidence" });
    Object.defineProperty(scene, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    });

    fireEvent.pointerMove(scene, {
      clientX: 200,
      clientY: 0,
      pointerType: "mouse",
    });
    expect(scene.getAttribute("style")).toContain("--scene-rx");

    fireEvent.pointerLeave(scene);
    expect(scene.getAttribute("style") ?? "").not.toContain("--scene-rx");
  });
});

describe("BrandLockup", () => {
  it("uses the Resumide concept-board wordmark and descriptor", () => {
    render(<BrandLockup />);
    expect(screen.getByText("Resumide")).toBeTruthy();
    expect(screen.getByText("Evidence desk")).toBeTruthy();
  });
});
