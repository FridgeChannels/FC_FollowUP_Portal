import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelReachable,
  contactMatchesChannelSender,
  endpointForChannel,
  unavailableChannelMessage,
} from "./channel-availability.ts";

const contact = {
  email: "owner@acme.co",
  emailValid: true,
  phone: "+1 415 555 0100",
  phoneValid: true,
  whatsapp: "+1 415 555 0199",
  linkedin: "https://www.linkedin.com/in/owner-acme",
};

describe("channelReachable", () => {
  it("uses WhatsApp Number, not Phone, for WhatsApp", () => {
    assert.equal(channelReachable(contact, "WhatsApp"), true);
    assert.equal(channelReachable({ ...contact, whatsapp: null }, "WhatsApp"), false);
    assert.equal(channelReachable({ ...contact, whatsapp: "  " }, "WhatsApp"), false);
    assert.equal(
      channelReachable({ ...contact, phone: null, phoneValid: false }, "WhatsApp"),
      true,
    );
  });

  it("keeps Phone/SMS on the Phone column", () => {
    assert.equal(channelReachable(contact, "Phone"), true);
    assert.equal(channelReachable(contact, "SMS"), true);
    assert.equal(channelReachable({ ...contact, phoneValid: false }, "SMS"), false);
    assert.equal(
      channelReachable({ ...contact, phone: null, whatsapp: "+14155550199", phoneValid: false }, "Phone"),
      false,
    );
  });

  it("requires a verified email and a LinkedIn URL", () => {
    assert.equal(channelReachable(contact, "Email"), true);
    assert.equal(channelReachable({ ...contact, emailValid: false }, "Email"), false);
    assert.equal(channelReachable({ ...contact, linkedin: "" }, "LinkedIn"), false);
  });
});

describe("endpointForChannel", () => {
  it("returns WhatsApp Number for WhatsApp and Phone for SMS/Phone", () => {
    assert.equal(endpointForChannel(contact, "WhatsApp"), "+1 415 555 0199");
    assert.equal(endpointForChannel(contact, "SMS"), "+1 415 555 0100");
    assert.equal(endpointForChannel(contact, "Phone"), "+1 415 555 0100");
    assert.equal(endpointForChannel({ ...contact, whatsapp: null }, "WhatsApp"), "");
  });
});

describe("contactMatchesChannelSender", () => {
  it("matches WhatsApp against WhatsApp Number, not Phone", () => {
    assert.equal(contactMatchesChannelSender(contact, "WhatsApp", "+14155550199"), true);
    assert.equal(contactMatchesChannelSender(contact, "WhatsApp", "+1 415 555 0100"), false);
    assert.equal(contactMatchesChannelSender(contact, "SMS", "+1 415 555 0100"), true);
  });
});

describe("unavailableChannelMessage", () => {
  it("names WhatsApp Number when WhatsApp is missing", () => {
    assert.match(unavailableChannelMessage("WhatsApp"), /WhatsApp Number/);
  });
});
