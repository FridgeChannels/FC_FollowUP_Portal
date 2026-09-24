export type ChannelType = "DTC" | "Amazon" | "DTC&Amazon";

export type AmazonSampleProduct = {
  url: string;
  name: string;
  price: string;
  imageUrl: string;
};

export const EMPTY_AMAZON_PRODUCT: AmazonSampleProduct = {
  url: "", name: "", price: "", imageUrl: "",
};

export function parseAmazonSampleProduct(value: string): AmazonSampleProduct {
  try {
    const parsed = JSON.parse(value) as Partial<AmazonSampleProduct>;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
      price: typeof parsed.price === "string" ? parsed.price : "",
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : "",
    };
  } catch {
    return { ...EMPTY_AMAZON_PRODUCT };
  }
}

export function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
