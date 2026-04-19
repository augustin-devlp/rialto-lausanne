"use client";

import { useState } from "react";
import type {
  MenuCategory,
  MenuItem,
  MenuItemOption,
  Restaurant,
} from "@/lib/types";
import Hero from "./Hero";
import MenuView from "./MenuView";
import AvisSection from "./AvisSection";
import ContactSection from "./ContactSection";
import LegalSection from "./LegalSection";
import FideliteSection from "./FideliteSection";
import FloatingCallButton from "./FloatingCallButton";

export type TabKey = "menu" | "avis" | "contact" | "legal" | "fidelite";

type Props = {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
  options: MenuItemOption[];
};

export default function RialtoHome({
  restaurant,
  categories,
  items,
  options,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("menu");

  const handleSelect = (t: TabKey) => {
    setActiveTab(t);
    // Scroll doux vers le contenu après le hero
    requestAnimationFrame(() => {
      const el = document.getElementById("tab-content");
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 20;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <Hero activeTab={activeTab} onSelect={handleSelect} />

      <div id="tab-content">
        {activeTab === "menu" && (
          <MenuView
            restaurant={restaurant}
            categories={categories}
            items={items}
            options={options}
          />
        )}
        {activeTab === "avis" && <AvisSection />}
        {activeTab === "contact" && <ContactSection />}
        {activeTab === "legal" && <LegalSection />}
        {activeTab === "fidelite" && <FideliteSection />}
      </div>

      <FloatingCallButton phone={restaurant.phone} />
    </div>
  );
}
