import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsInlineBase64,
  emailBodyIsEmpty,
  extractEmailImageSrcs,
  htmlToPlainText,
  looksLikeEmailHtml,
  prepareEmailContent,
  sanitizeEmailHtml,
  toGmailBlockHtml,
} from "./email-html.ts";

const s3 = "https://bucket.s3.us-east-1.amazonaws.com/images/abc.jpg";
const allow = (url: string) => url.startsWith("https://bucket.s3.us-east-1.amazonaws.com/");

describe("email html sanitizer", () => {
  it("keeps simple formatting and s3 images", () => {
    const html = sanitizeEmailHtml(
      `<p>Hi <strong>Alex</strong></p><p><img src="${s3}" alt="catalog"></p>`,
      allow,
    );
    assert.match(html, /<p>Hi <strong>Alex<\/strong><\/p>/);
    assert.match(html, /src="https:\/\/bucket\.s3\.us-east-1\.amazonaws\.com\/images\/abc\.jpg"/);
    assert.match(html, /alt="catalog"/);
    assert.match(html, /max-width:100%/);
  });

  it("strips scripts, handlers, and javascript urls", () => {
    const html = sanitizeEmailHtml(
      `<p onclick="alert(1)">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="${s3}" onerror="alert(1)">`,
      allow,
    );
    assert.equal(html.includes("script"), false);
    assert.equal(html.includes("onclick"), false);
    assert.equal(html.includes("onerror"), false);
    assert.equal(html.includes("javascript:"), false);
    assert.match(html, /<p>Hi<\/p>/);
    assert.match(html, /src="/);
  });

  it("drops remote and base64 images", () => {
    const html = sanitizeEmailHtml(
      `<p><img src="https://evil.example/x.png"><img src="data:image/png;base64,aaaa"><img src="${s3}"></p>`,
      allow,
    );
    assert.equal(html.includes("evil.example"), false);
    assert.equal(html.includes("base64"), false);
    assert.match(html, /abc\.jpg/);
  });

  it("detects html vs legacy plain text", () => {
    assert.equal(looksLikeEmailHtml("Hello 3 < 5 and mark@x.com"), false);
    assert.equal(looksLikeEmailHtml("<p>Hello</p>"), true);
    assert.equal(containsInlineBase64("data:image/png;base64,abc"), true);
    assert.equal(emailBodyIsEmpty("<p></p>"), true);
    assert.equal(emailBodyIsEmpty("<p>Hi</p>"), false);
    assert.equal(emailBodyIsEmpty(`<p><img src="${s3}"></p>`), false);
  });

  it("prepareEmailContent keeps plain text and sanitizes html", () => {
    const plain = prepareEmailContent("Hello\n\nNext line", allow);
    assert.equal(plain.kind, "plain");
    assert.equal(plain.content, "Hello\n\nNext line");

    const html = prepareEmailContent(`<p>Hi</p><script>x</script><img src="${s3}">`, allow);
    assert.equal(html.kind, "html");
    assert.equal(html.content.includes("script"), false);
    assert.match(html.content, /<div>Hi<\/div>/);

    assert.throws(
      () => prepareEmailContent("hello data:image/png;base64,xxxx", allow),
      /base64/,
    );
  });

  it("does not double-escape editor entities", () => {
    assert.equal(
      sanitizeEmailHtml("<p>A &amp; B&nbsp;&nbsp;x &lt;tag&gt; &#39;q&#39;</p>", allow),
      "<p>A &amp; B&nbsp;&nbsp;x &lt;tag&gt; 'q'</p>",
    );
  });

  it("keeps ampersands and named entities from pasted content readable", () => {
    assert.equal(
      sanitizeEmailHtml("<p>R&amp;D, AT&T, a & b, &amp;amp; stays literal</p>", allow),
      "<p>R&amp;D, AT&amp;T, a &amp; b, &amp;amp; stays literal</p>",
    );
    assert.equal(
      sanitizeEmailHtml("<p>sample &mdash; it&rsquo;s caf&eacute; &#x2014; &frac34; &#99999999;</p>", allow),
      "<p>sample \u2014 it\u2019s caf\u00e9 \u2014 &frac34; &#99999999;</p>",
    );
  });

  it("keeps runs of typed spaces visible", () => {
    assert.equal(sanitizeEmailHtml("<p>two  spaces   three</p>", allow), "<p>two&nbsp; spaces&nbsp;&nbsp; three</p>");
  });

  it("keeps a bounded image width", () => {
    assert.match(sanitizeEmailHtml(`<img src="${s3}" width="320" height="99">`, allow), /width="320" style="width:320px;max-width:100%;height:auto"/);
    assert.match(sanitizeEmailHtml(`<img src="${s3}" width="9000">`, allow), /width="1200"/);
    assert.equal(sanitizeEmailHtml(`<img src="${s3}" width="abc">`, allow).includes("width="), false);
  });

  it("rewrites paragraphs into Gmail line divs so blank lines survive", () => {
    assert.equal(
      toGmailBlockHtml("<p>Hi Alex,</p><p></p><p></p><p>Line<br />next</p><p>end<br /></p><ul><li><p>item</p></li></ul>"),
      "<div>Hi Alex,</div><div><br /></div><div><br /></div><div>Line<br />next</div><div>end<br /><br /></div><ul><li><div>item</div></li></ul>",
    );
    assert.equal(toGmailBlockHtml("<div>done</div>"), "<div>done</div>");
  });

  it("converts html to plain text for Gmail fallback", () => {
    assert.equal(htmlToPlainText("<p>Hi <strong>Alex</strong></p><p>Next</p>"), "Hi Alex\nNext");
    assert.deepEqual(extractEmailImageSrcs(`<p><img src="${s3}"></p>`), [s3]);
  });
});
