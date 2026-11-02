import fs from "node:fs";

function resetBudgetResults(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  let resetCount = 0;

  const newLines = lines.map((line) => {
    const trimmed = line.trimEnd();
    if (/^BUD-\d+/.test(trimmed)) {
      resetCount++;
      // Locate the .md file column
      const mdMatch = trimmed.match(/^(.*02_budget\/BUD-[^,]+\.md)/);
      if (mdMatch) {
        return mdMatch[1] + ",,,,";
      }
      // Fallback split if needed
      const parts = trimmed.split(",");
      let fileIdx = -1;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes(".md")) {
          fileIdx = i;
          break;
        }
      }
      if (fileIdx !== -1) {
        return parts.slice(0, fileIdx + 1).join(",") + ",,,,";
      }
    }
    return line;
  });

  try {
    fs.writeFileSync(filePath, newLines.join("\n"));
    console.log(`Successfully reset ${resetCount} BUD rows in ${filePath}`);
    return true;
  } catch (err) {
    console.warn(`Could not directly write to ${filePath}: ${err.message}`);
    return false;
  }
}

// Update both index_updated.csv and index.csv
const updatedSuccess = resetBudgetResults("../testing_final/index_updated.csv");
const indexSuccess = resetBudgetResults("../testing_final/index.csv");

console.log("Summary:", { updatedSuccess, indexSuccess });
