import { describe, expect, it } from "vitest";
import { scoreWeightedSearchDocument } from "@/lib/search";

describe("scoreWeightedSearchDocument", () => {
  it("prioritizes exact name matches over category and description matches", () => {
    const exactNameScore = scoreWeightedSearchDocument(
      {
        name: "Royal Blue Suit",
        category: "Party Wear",
        description: "Handmade formal set",
      },
      "Royal Blue Suit",
    );
    const categoryScore = scoreWeightedSearchDocument(
      {
        name: "Evening Set",
        category: "Royal Blue Suit",
        description: "Handmade formal set",
      },
      "Royal Blue Suit",
    );
    const descriptionScore = scoreWeightedSearchDocument(
      {
        name: "Evening Set",
        category: "Party Wear",
        description: "Royal Blue Suit with handmade details",
      },
      "Royal Blue Suit",
    );

    expect(exactNameScore).toBeGreaterThan(categoryScore);
    expect(categoryScore).toBeGreaterThan(descriptionScore);
  });

  it("keeps exact category matches ahead of exact description matches", () => {
    const categoryScore = scoreWeightedSearchDocument(
      {
        name: "Evening Set",
        category: "Bridal",
        description: "Handmade formal set",
      },
      "Bridal",
    );
    const descriptionScore = scoreWeightedSearchDocument(
      {
        name: "Evening Set",
        category: "Formal Wear",
        description: "Bridal details with handmade finishing",
      },
      "Bridal",
    );

    expect(categoryScore).toBeGreaterThan(descriptionScore);
  });
});
