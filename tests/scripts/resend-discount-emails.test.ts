import {
  buildWelcomeDiscountEmailMessage,
  parseCommandLineArgs,
  parseEnvFileContent,
  resolveOfferConfig,
} from "../../scripts/resend-discount-emails.mjs";

describe("resend discount emails script", () => {
  it("defaults to dry-run mode", () => {
    expect(parseCommandLineArgs([])).toEqual({
      apply: false,
      help: false,
      limit: null,
      email: "",
      filterCampaign: "",
      filterCode: "",
      campaign: "",
      code: "",
      onlyNeverEmailed: false,
      batchSize: 200,
    });
  });

  it("parses filters and overrides", () => {
    expect(
      parseCommandLineArgs([
        "--",
        "--apply",
        "--limit=25",
        "--batch-size=50",
        "--email=Owner@Example.com",
        "--filter-campaign=legacy_welcome",
        "--filter-code=launch10",
        "--campaign=welcome15_relaunch",
        "--code=welcome15",
        "--only-never-emailed",
      ]),
    ).toEqual({
      apply: true,
      help: false,
      limit: 25,
      email: "owner@example.com",
      filterCampaign: "legacy_welcome",
      filterCode: "LAUNCH10",
      campaign: "welcome15_relaunch",
      code: "WELCOME15",
      onlyNeverEmailed: true,
      batchSize: 50,
    });
  });

  it("parses env file content with quotes and spaces", () => {
    expect(
      parseEnvFileContent([
        "# comment",
        "RESEND_FROM_EMAIL=Ria's Boutique <orders@riasboutique.com>",
        'WELCOME_DISCOUNT_CODE="WELCOME15"',
        "export DISCOUNT_CAMPAIGN_NAME='welcome15_relaunch'",
      ].join("\n")),
    ).toEqual({
      RESEND_FROM_EMAIL: "Ria's Boutique <orders@riasboutique.com>",
      WELCOME_DISCOUNT_CODE: "WELCOME15",
      DISCOUNT_CAMPAIGN_NAME: "welcome15_relaunch",
    });
  });

  it("builds the offer config from env overrides", () => {
    expect(
      resolveOfferConfig(
        {
          DISCOUNT_CAMPAIGN_NAME: "welcome15_relaunch",
          WELCOME_DISCOUNT_CODE: "WELCOME15",
          WELCOME_DISCOUNT_RATE: "0.15",
          WELCOME_DISCOUNT_EXPIRES_AT: "2026-05-19T05:59:59.999Z",
        },
        {},
      ),
    ).toMatchObject({
      campaign: "welcome15_relaunch",
      code: "WELCOME15",
      rate: 0.15,
      percentLabel: "15%",
    });
  });

  it("builds a welcome email using the resolved offer", () => {
    const offer = resolveOfferConfig(
      {
        STORE_BRAND_NAME: "Ria's Boutique",
        CLOVER_CHECKOUT_BASE_URL: "https://www.riasboutique.com",
        RESEND_REPLY_TO_EMAIL: "help@riasboutique.com",
        WELCOME_DISCOUNT_CODE: "WELCOME15",
        WELCOME_DISCOUNT_RATE: "0.15",
        WELCOME_DISCOUNT_EXPIRES_AT: "2026-05-19T05:59:59.999Z",
      },
      {},
    );

    const message = buildWelcomeDiscountEmailMessage({
      fullName: "Ria",
      offer,
      env: {
        STORE_BRAND_NAME: "Ria's Boutique",
        CLOVER_CHECKOUT_BASE_URL: "https://www.riasboutique.com",
        RESEND_REPLY_TO_EMAIL: "help@riasboutique.com",
      },
    });

    expect(message.subject).toContain("New Arrivals");
    expect(message.text).toContain("WELCOME15");
    expect(message.text).toContain("So many new pieces have just arrived");
    expect(message.text).toContain("launch discount subscribers");
    expect(message.text).toContain("https://www.riasboutique.com/collection");
    expect(message.html).toContain("WELCOME15");
    expect(message.html).toContain("New Arrivals Are Here");
    expect(message.replyTo).toBe("help@riasboutique.com");
  });
});
