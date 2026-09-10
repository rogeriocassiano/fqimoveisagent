import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FQ Inteligência Imobiliária",
  description: "Agentes de IA para corretores e clientes da FQ Imóveis",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
