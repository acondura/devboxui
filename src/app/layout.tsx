import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "DevBox UI | Automated Cloud IDE Provisioning",
	description: "Transform raw VPS infrastructure into high-performance, secure development boxes in seconds. One-click provisioning for Hetzner Cloud with Zero-Trust security.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
				<meta name="darkreader-lock" />
				<script
					dangerouslySetInnerHTML={{
						__html: `
							window.addEventListener('error', function(event) {
								var msg = event.message || '';
								if (
									msg.indexOf('ChunkLoadError') !== -1 ||
									msg.indexOf('Loading chunk') !== -1 ||
									msg.indexOf('Failed to fetch dynamically imported module') !== -1
								) {
									console.warn('Global ChunkLoadError detected. Reloading page...');
									window.location.reload();
								}
							});
						`
					}}
				/>
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<ThemeProvider>{children}</ThemeProvider>
			</body>
		</html>
	);
}
