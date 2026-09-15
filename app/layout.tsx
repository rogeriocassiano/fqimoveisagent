"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./globals.css";
import FloatingAssistant from "./components/FloatingAssistant";
import PwaRegister from "./components/PwaRegister";

function getToken() {
  if (typeof document === "undefined") return null;
  return document.cookie.match(/sb-access-token=([^;]+)/)?.[1] ?? null;
}

function getRole() {
  if (typeof document === "undefined") return null;
  return document.cookie.match(/sb-role=([^;]+)/)?.[1] ?? null;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(getToken);
  const [role, setRole] = useState<string | null>(getRole);
  const isTrainee = role === "trainee";

  function logout() {
    document.cookie = "sb-access-token=; path=/; max-age=0";
    document.cookie = "sb-refresh-token=; path=/; max-age=0";
    document.cookie = "sb-role=; path=/; max-age=0";
    setToken(null);
    setRole(null);
    router.push("/login");
  }

  const isLogin = pathname === "/login";

  useEffect(() => {
    function update() { setToken(getToken()); setRole(getRole()); }
    update();
    const interval = setInterval(update, 250);
    const timeout = setTimeout(() => clearInterval(interval), 2000);
    window.addEventListener("focus", update);
    return () => { clearInterval(interval); clearTimeout(timeout); window.removeEventListener("focus", update); };
  }, [pathname]);

  return <html lang="pt-BR" className="dark">
    <body>
      <meta name="theme-color" content="#0f0f0f" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="FQ Imóveis" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <PwaRegister />
      {!isLogin && token && (
        <header style={{ position: "sticky", top: 0, zIndex: 40 }}>
          <Link href={isTrainee ? "/academy" : "/admin"}><Image src="/logo-fq.png" alt="FQ Imóveis" width={160} height={48} priority /></Link>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {!isTrainee && <Link href="/chat" className="button ghost">Chat</Link>}
            <Link href="/academy" className="button ghost">Academy</Link>
            {!isTrainee && <Link href="/admin" className="button ghost">Treinar</Link>}
            <button onClick={logout} className="button">Sair</button>
          </nav>
        </header>
      )}
      {children}
      {!isLogin && token && !isTrainee && <FloatingAssistant />}
    </body>
  </html>;
}
