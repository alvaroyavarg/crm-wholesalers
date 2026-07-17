import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "CRM Mayoristas",
  description: "CRM de cuentas clave + copiloto KAM — canal mayorista",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body
        className={`${inter.variable} ${poppins.variable} font-sans bg-fondo text-gray-800 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
