import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTemplateVariableContext,
  ownerNameFromContacts,
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
  senderName: "Ella",
});

describe("template variable engine", () => {
  it("replaces catalog keys and leaves unknown tokens", () => {
    const text = "Hi {{contact_name}} at {{company_name}} ({{unknown}})";
    assert.equal(
      resolveTemplateVariables(text, context),
      "Hi Melissa Gulbranson at Oxyfresh ({{unknown}})",
    );
  });

  it("derives first_name from the contact name", () => {
    assert.equal(resolveTemplateVariables("Hi {{first_name}}", context), "Hi Melissa");
  });

  it("keeps contact tokens until a contact is provided", () => {
    const companyOnly = buildTemplateVariableContext({
      companyName: "Oxyfresh",
      productDescription: "Oral care",
      matchedCategory: "Pet",
    });
    assert.equal(
      resolveTemplateVariables("{{company_name}} {{contact_role}} {{product_description}}", companyOnly),
      "Oxyfresh {{contact_role}} Oral care",
    );
  });

  it("replaces contact_role once a contact is selected", () => {
    const withContact = buildTemplateVariableContext({
      companyName: "Oxyfresh",
      productDescription: "Oral care",
      matchedCategory: "Pet",
      hasContact: true,
      contactName: "Melissa Gulbranson",
      contactRole: "Founder / CEO / COO",
    });
    assert.equal(
      resolveTemplateVariables("{{Matched Category}}{{contact_role}}{{product_description}}", withContact),
      "PetFounder / CEO / COOOral care",
    );
  });

  it("matches contact_role regardless of spacing or case", () => {
    assert.equal(resolveTemplateVariables("{{Contact Role}}", context), "Decision Maker");
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

  it("replaces Follow-up-Exhibition from Follow-up ClientDB", () => {
    const withExhibition = buildTemplateVariableContext({
      companyName: "Oxyfresh",
      followupExhibition: "Expo West 2026",
      senderName: "Ella",
    });
    assert.equal(
      resolveTemplateVariables("Met at {{Follow-up-Exhibition}}", withExhibition),
      "Met at Expo West 2026",
    );
    assert.equal(
      resolveTemplateVariables("Met at {{Follow-up Exhibition}}", withExhibition),
      "Met at Expo West 2026",
    );
  });

  it("replaces owner_name from the brand Owner, not the selected contact", () => {
    const connectorLaunch = buildTemplateVariableContext({
      companyName: "Oxyfresh",
      hasContact: true,
      contactName: "John Smith",
      ownerOrConnector: "Connector",
      ownerName: "Melissa Gulbranson",
    });
    assert.equal(
      resolveTemplateVariables("Hi {{contact_name}}, please intro {{owner_name}}", connectorLaunch),
      "Hi John Smith, please intro Melissa Gulbranson",
    );
  });

  it("fills owner_name from the selected contact when that person is the Owner", () => {
    assert.equal(resolveTemplateVariables("{{owner_name}}", context), "Melissa Gulbranson");
  });

  it("keeps owner_name until an Owner is available", () => {
    const connectorOnly = buildTemplateVariableContext({
      companyName: "Oxyfresh",
      hasContact: true,
      contactName: "John Smith",
      ownerOrConnector: "Connector",
    });
    assert.equal(
      resolveTemplateVariables("Path to {{owner_name}}", connectorOnly),
      "Path to {{owner_name}}",
    );
  });

  it("picks the Owner contact from a brand roster", () => {
    assert.equal(
      ownerNameFromContacts([
        { role: "Connector", name: "John Smith" },
        { role: "Owner", name: "Melissa Gulbranson" },
      ]),
      "Melissa Gulbranson",
    );
  });

  it("replaces the literal [Sender Name] from SENDER_NAME", () => {
    assert.equal(
      resolveTemplateVariables("Best,\n[Sender Name]", context),
      "Best,\nElla",
    );
    assert.equal(
      resolveTemplateVariables("Best,\n[ sender name ]", context),
      "Best,\nElla",
    );
  });
});
