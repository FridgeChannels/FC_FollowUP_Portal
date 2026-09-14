import { Channel } from "@/lib/outreach-domain";

const src: Record<Channel, string> = {
  Email: "/channels/email.png",
  SMS: "/channels/sms.png",
  WhatsApp: "/channels/whatsapp.png",
  LinkedIn: "/channels/linkedin.png",
  Phone: "/channels/phone.png",
};

export function ChannelIcon({ channel, className = "size-5", alt }: { channel: Channel; className?: string; alt?: string }) {
  return <img src={src[channel]} alt={alt ?? channel} className={className} />;
}

export function ChannelOption({ channel }: { channel: Channel }) {
  return <span className="inline-flex items-center gap-2"><ChannelIcon channel={channel} className="size-4 shrink-0"/>{channel}</span>;
}
