import { crestUrl } from "@/lib/teams";

export default function Crest({ name }: { name: string }) {
  const url = crestUrl(name);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} width={18} height={18} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 5, flexShrink: 0, objectFit: "contain" }} />;
}
