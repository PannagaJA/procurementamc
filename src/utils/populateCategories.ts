import { supabase } from "@/integrations/supabase/client";

const categories = [
  // Original categories with prefixes (avoiding conflicts with existing ones)
  { name: "Electronics", prefix: "ELEC" },
  { name: "Furniture", prefix: "FURN" },
  { name: "Office Supplies", prefix: "OFFS" },
  { name: "Equipment", prefix: "EQUIPS" }, // Changed from EQUIP
  { name: "Vehicles", prefix: "VEH" },

  // Additional IT Equipment (avoiding existing prefixes like SRV, STOR)
  { name: "Computers & Laptops", prefix: "COMP" },
  { name: "Servers", prefix: "SERV" }, // Changed from SRV
  { name: "Network Equipment", prefix: "NET" },
  { name: "Printers & Scanners", prefix: "PRINT" },
  { name: "Monitors & Displays", prefix: "MONIT" }, // Changed from MON
  { name: "Keyboards & Mice", prefix: "INPUT" },
  { name: "Storage Devices", prefix: "STORE" }, // Changed from STOR
  { name: "Software Licenses", prefix: "SWLICS" }, // Changed from SWLIC
  { name: "IT Accessories", prefix: "ITACC" },

  // Furniture & Office (avoiding existing prefixes like CHAIR)
  { name: "Desks & Tables", prefix: "DESK" },
  { name: "Chairs", prefix: "CHAIRS" }, // Changed from CHAIR
  { name: "Cabinets & Storage", prefix: "CABIN" }, // Changed from CAB
  { name: "Office Furniture", prefix: "OFFURN" },
  { name: "Conference Room Equipment", prefix: "CONF" },

  // Security & Safety (avoiding existing prefixes like SECCAM, FIRE)
  { name: "Security Cameras", prefix: "SECCAMS" }, // Changed from SECCAM
  { name: "Access Control Systems", prefix: "ACCESS" },
  { name: "Fire Safety Equipment", prefix: "FIRES" }, // Changed from FIRE
  { name: "Safety Gear", prefix: "SAFETY" },
  { name: "Security Software", prefix: "SECSoft" },

  // Facilities & Maintenance (avoiding existing prefixes like CLEAN)
  { name: "HVAC Systems", prefix: "HVAC" },
  { name: "Electrical Equipment", prefix: "ELECTR" }, // Changed from ELEC
  { name: "Plumbing Supplies", prefix: "PLUMB" },
  { name: "Cleaning Supplies", prefix: "CLEANS" }, // Changed from CLEAN
  { name: "Maintenance Tools", prefix: "MAINT" },

  // Medical Equipment
  { name: "Medical Devices", prefix: "MEDDEV" },
  { name: "Laboratory Equipment", prefix: "LAB" },
  { name: "Patient Care Equipment", prefix: "PATCARE" },
  { name: "Medical Supplies", prefix: "MEDSUP" },

  // Vehicles & Transportation
  { name: "Company Vehicles", prefix: "VEHS" }, // Changed from VEH to avoid conflict
  { name: "Fleet Management", prefix: "FLEET" },
  { name: "Vehicle Accessories", prefix: "VEHACC" },
  { name: "Transportation Equipment", prefix: "TRANS" },

  // Communication
  { name: "Telephones & VoIP", prefix: "PHONES" }, // Changed from PHONE
  { name: "Communication Equipment", prefix: "COMM" },
  { name: "Audio/Video Equipment", prefix: "AV" },
  { name: "Presentation Tools", prefix: "PRESENT" },

  // Consumables
  { name: "Paper & Stationery", prefix: "PAPER" },
  { name: "Ink & Toner", prefix: "INK" },
  { name: "Office Consumables", prefix: "CONSUM" },
  { name: "Kitchen Supplies", prefix: "KITCHEN" },

  // Specialized Equipment
  { name: "Industrial Equipment", prefix: "INDUST" },
  { name: "Manufacturing Tools", prefix: "MANUF" },
  { name: "Research Equipment", prefix: "RESEARCH" },
  { name: "Specialized Machinery", prefix: "MACH" },

  // Miscellaneous
  { name: "Miscellaneous", prefix: "MISC" },
  { name: "Assets", prefix: "ASSET" },
  { name: "Inventory", prefix: "INV" },
];

export const populateCategories = async () => {
  try {
    console.log("Starting category population...");

    // Get existing categories to avoid duplicates
    const { data: existingCategories, error: fetchError } = await supabase
      .from("categories")
      .select("name, prefix");

    if (fetchError) {
      console.error("Error fetching existing categories:", fetchError);
      return;
    }

    const existingNames = new Set(existingCategories?.map((cat) => cat.name.toLowerCase()) || []);
    const existingPrefixes = new Set(
      existingCategories?.map((cat) => (cat.prefix || "").toLowerCase()).filter(Boolean) || [],
    );

    // Filter out categories that already exist (by name or prefix)
    const newCategories = categories.filter(
      (cat) =>
        !existingNames.has(cat.name.toLowerCase()) &&
        !existingPrefixes.has(cat.prefix.toLowerCase()),
    );

    // Log which categories are being skipped
    const skippedCategories = categories.filter(
      (cat) =>
        existingNames.has(cat.name.toLowerCase()) || existingPrefixes.has(cat.prefix.toLowerCase()),
    );

    if (skippedCategories.length > 0) {
      console.log(
        "Skipping existing categories:",
        skippedCategories.map((cat) => `${cat.name} (${cat.prefix})`),
      );
    }

    if (newCategories.length === 0) {
      console.log("All categories already exist!");
      return;
    }

    console.log(`Adding ${newCategories.length} new categories...`);

    // Insert new categories with both name and prefix
    const { data, error } = await supabase
      .from("categories")
      .insert(newCategories.map((cat) => ({ name: cat.name, prefix: cat.prefix })))
      .select();

    if (error) {
      console.error("Error inserting categories:", error);
      return;
    }

    console.log(`Successfully added ${data?.length || 0} categories:`, data);
  } catch (error) {
    console.error("Error in populateCategories:", error);
  }
};

// Auto-run if this script is executed directly
if (typeof window !== "undefined") {
  // Browser environment - can be called from console
  (window as any).populateCategories = populateCategories;
  console.log(
    "populateCategories function is now available in the console. Run populateCategories() to populate categories.",
  );
  console.log("Note: You must be logged in as an admin user for this to work.");
}
