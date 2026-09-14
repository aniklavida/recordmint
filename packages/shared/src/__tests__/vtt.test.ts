import { describe, expect, it } from "vitest";
import { cuesToPlainText, formatVtt, parseVtt, searchCues } from "../vtt.js";

const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:03.500
Welcome to the quarterly planning walkthrough.

00:00:03.500 --> 00:00:07.000
Let's talk about the roadmap for next quarter.

00:01:05.250 --> 00:01:08.000
<v Speaker>That covers the roadmap section.</v>
`;

describe("parseVtt", () => {
  it("extracts every cue with its start and end time and plain text", () => {
    const cues = parseVtt(SAMPLE_VTT);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toEqual({ startSeconds: 0, endSeconds: 3.5, text: "Welcome to the quarterly planning walkthrough." });
    expect(cues[1]!.startSeconds).toBe(3.5);
    expect(cues[2]!.startSeconds).toBe(65.25);
  });

  it("strips inline VTT markup tags from cue text", () => {
    const cues = parseVtt(SAMPLE_VTT);
    expect(cues[2]!.text).toBe("That covers the roadmap section.");
  });

  it("ignores the WEBVTT header and returns an empty list for a header-only file", () => {
    expect(parseVtt("WEBVTT\n")).toEqual([]);
  });

  it("handles an hours component in the timestamp", () => {
    const cues = parseVtt("WEBVTT\n\n01:02:03.000 --> 01:02:05.000\nAn hour in.\n");
    expect(cues[0]!.startSeconds).toBe(3723);
  });
});

describe("searchCues", () => {
  it("finds the cue containing the query, case-insensitively", () => {
    const cues = parseVtt(SAMPLE_VTT);
    const results = searchCues(cues, "ROADMAP");
    expect(results).toHaveLength(2);
    expect(results[0]!.startSeconds).toBe(3.5);
  });

  it("returns nothing for a query that matches no cue", () => {
    const cues = parseVtt(SAMPLE_VTT);
    expect(searchCues(cues, "nonexistent")).toEqual([]);
  });

  it("returns nothing for an empty query rather than every cue", () => {
    const cues = parseVtt(SAMPLE_VTT);
    expect(searchCues(cues, "   ")).toEqual([]);
  });
});

describe("formatVtt / cuesToPlainText", () => {
  it("round-trips: formatting cues then parsing the result yields the same cues", () => {
    const original = parseVtt(SAMPLE_VTT);
    const roundTripped = parseVtt(formatVtt(original));
    expect(roundTripped.map((c) => ({ startSeconds: c.startSeconds, text: c.text }))).toEqual(
      original.map((c) => ({ startSeconds: c.startSeconds, text: c.text })),
    );
  });

  it("formats a real WEBVTT header and timestamp line", () => {
    const vtt = formatVtt([{ startSeconds: 65.25, endSeconds: 68, text: "Hello" }]);
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("00:01:05.250 --> 00:01:08.000");
    expect(vtt).toContain("Hello");
  });

  it("joins cue text into one plain-text string for search", () => {
    const cues = parseVtt(SAMPLE_VTT);
    expect(cuesToPlainText(cues)).toBe(
      "Welcome to the quarterly planning walkthrough. Let's talk about the roadmap for next quarter. That covers the roadmap section.",
    );
  });
});
