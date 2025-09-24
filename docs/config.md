## --Configuration System Documentation--

This system uses a config-driven architecture to support flexible assessment report generation. All logic for rendering sections, mapping data fields, and applying classification rules is defined in a single configuration file (config.js), making it easy to extend without modifying core code.

# 1. Adding New Assessment Types
To support a new assessment_id, simply add a new entry to the config.js object:

js:
---
const config = {
  as_hr_02: { ... },
  as_card_01: { ... },
  as_new_03: {
    sections: ["Vitals", "Summary"],
    mappings: {
      vitals: "vitalsMap.vitals",
      summary: "summaryMap.overview",
    },
    classifications: {
      heart_rate: [
        { label: "Low", range: [0, 60] },
        { label: "Normal", range: [61, 100] },
        { label: "High", range: [101, 200] },
      ],
    },
  },
};
---
No changes are needed in the PDF generation logic—just update the config.

# 2. Modifying Data Field Mappings
Each section uses a JSON path to locate data from the session object. For example:

js:
---
mappings: {
  bmi: "bodyMap.metrics.bmi",
  blood_pressure: "vitalsMap.vitals.bp",
}
---
To change where a field pulls from, simply update the path string.

# 3. Updating Classification Ranges
Classification logic is defined per field using labeled ranges:

js:
---
classifications: {
  bmi: [
    { label: "Underweight", range: [0, 18.4] },
    { label: "Normal", range: [18.5, 24.9] },
    { label: "Overweight", range: [25, 29.9] },
    { label: "Obese", range: [30, 100] },
  ],
}
---
To update thresholds or labels, just modify the range values or label text.

# 4.Example Configuration Structure
js:
---
const config = {
  as_hr_02: {
    sections: ["BMI", "Vitals"],
    mappings: {
      bmi: "bodyMap.metrics.bmi",
      heart_rate: "vitalsMap.vitals.heart_rate",
    },
    classifications: {
      bmi: [...],
      heart_rate: [...],
    },
  },
  as_card_01: {
    sections: ["Blood Pressure", "Summary"],
    mappings: {
      bp: "vitalsMap.vitals.bp",
      summary: "summaryMap.overview",
    },
    classifications: {
      bp: [...],
    },
  },
};
---

# How It Works
->The PDF generator reads assessment_id from session data
->It loads the corresponding config block
->Each section is rendered based on sections[]
->Data is pulled using mappings
->Classification labels are applied using classifications