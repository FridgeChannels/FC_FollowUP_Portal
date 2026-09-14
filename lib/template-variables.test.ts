import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTemplateVariableContext,
  resolveOutboundFields,
  resolveTemplateVariables,
} from "./template-variables.ts";

const context = buildTemplateVariableContext({
  companyName: "Oxyfresh",
  productDescription: "Oral care",
  matchedCategory: "Pet",
  contactName: "Melissa Gulbranson",
  contactTitle: "CEO",
  contactRole: "Decision Maker",
  email: "melissag@oxyfresh.com",
  phone: "+1 208 555 0100",
  ownerOrConnector: "Owner",
  linkedinUrl: "https://linkedin.com/in/melissa",
});

describe("template variable engine", () => {
  it("replaces catalog keys and leaves unknown tokens", () => {
    const text = "Hi {{contact_name}} at {{company_name}} ({{unknown}})";
    assert.equal(
      resolveTemplateVariables(text, context),
      "Hi Melissa Gulbranson at Oxyfresh ({{unknown}})",
    );
  });

  it("resolves spaced keys and empty fields", () => {
    const text = "{{Matched Category}} {{LinkedIn URL}} {{missing_optional}}";
    assert.equal(
      resolveTemplateVariables(text, {
        ...context,
        "LinkedIn URL": "",
      }),
      "Pet  {{missing_optional}}",
    );
  });

  it("writes email subject and body separately", () => {
    const resolved = resolveOutboundFields({
      channel: "Email",
      subject: "For {{company_name}}",
      content: "Hello {{contact_name}}",
    }, context);
    assert.equal(resolved.subject, "For Oxyfresh");
    assert.equal(resolved.content, "Hello Melissa Gulbranson");
  });
});
