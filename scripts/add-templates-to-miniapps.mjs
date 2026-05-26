import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_BASE = "https://api.weixin.qq.com";

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function usage() {
  return `
Usage:
  node scripts/add-templates-to-miniapps.mjs --templates exports/templates-xxx.json --targets targets.json

Options:
  --templates   Exported template JSON from export-miniapp-templates.mjs.
  --targets     Target mini program list JSON.
  --out         Output result path. Default: exports/add-template-results-<timestamp>.json
  --dry-run     Check what would be added without calling addtemplate.
`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat API error ${data.errcode}: ${data.errmsg || JSON.stringify(data)}`);
  }

  return data;
}

async function getAccessToken(target) {
  if (target.accessToken) {
    return target.accessToken;
  }

  if (!target.appid || !target.secret) {
    throw new Error("Target must include appid/secret or accessToken.");
  }

  const data = await requestJson(`${API_BASE}/cgi-bin/stable_token`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: target.appid,
      secret: target.secret
    })
  });

  if (!data.access_token) {
    throw new Error(`Missing access_token in response: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function getTemplateList(accessToken) {
  const url = new URL(`${API_BASE}/wxaapi/newtmpl/gettemplate`);
  url.searchParams.set("access_token", accessToken);

  const data = await requestJson(url);
  return data.data || [];
}

async function addTemplate(accessToken, template) {
  const url = new URL(`${API_BASE}/wxaapi/newtmpl/addtemplate`);
  url.searchParams.set("access_token", accessToken);

  return requestJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tid: String(template.publicTid),
      kidList: template.kidList,
      sceneDesc: template.sceneDesc
    })
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("exports", `add-template-results-${timestamp}.json`);
}

function parseTemplateFields(content) {
  const fields = [];
  const seen = new Set();
  const linePattern = /([^:\n\uFF1A]+)[:\uFF1A]\s*\{\{([^}]+)\}\}/g;

  for (const match of (content || "").matchAll(linePattern)) {
    const name = match[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    fields.push(name);
  }

  return fields;
}

function sameFieldNames(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function findExistingTemplate(existingTemplates, sourceTemplate) {
  const sourceFields = (sourceTemplate.fields || []).map((item) => item.name);

  return existingTemplates.find((template) => {
    if (template.title !== sourceTemplate.title) return false;
    const existingFields = parseTemplateFields(template.content);
    return sourceFields.length === 0 || sameFieldNames(existingFields, sourceFields);
  });
}

function loadTemplateConfigs(templateExportPath) {
  const source = readJson(templateExportPath);
  const templates = source.templates || [];

  return templates.map((template) => ({
    code: template.code || template.title,
    title: template.title,
    type: template.type,
    typeName: template.typeName,
    publicTid: template.publicTid,
    kidList: template.kidList || [],
    sceneDesc: template.sceneDesc || `${template.title || "Template"} scene`,
    fields: template.fields || [],
    sourcePriTmplId: template.priTmplId
  }));
}

function validateTemplateConfigs(configs) {
  const invalid = configs.filter((template) => (
    !template.title ||
    !template.publicTid ||
    !Array.isArray(template.kidList) ||
    template.kidList.length === 0
  ));

  if (invalid.length > 0) {
    const titles = invalid.map((item) => item.title || "(untitled)").join(", ");
    throw new Error(`Some templates are missing publicTid or kidList: ${titles}`);
  }
}

async function processTarget(target, templateConfigs, dryRun) {
  const targetName = target.name || target.appid || "unnamed";
  const result = {
    name: target.name || "",
    appid: target.appid || "",
    status: "ok",
    templates: [],
    errors: []
  };

  try {
    const accessToken = await getAccessToken(target);
    const existingTemplates = await getTemplateList(accessToken);

    for (const template of templateConfigs) {
      const existing = findExistingTemplate(existingTemplates, template);

      if (existing) {
        result.templates.push({
          code: template.code,
          title: template.title,
          action: "skipped_existing",
          priTmplId: existing.priTmplId,
          publicTid: template.publicTid,
          kidList: template.kidList
        });
        continue;
      }

      if (dryRun) {
        result.templates.push({
          code: template.code,
          title: template.title,
          action: "would_add",
          priTmplId: null,
          publicTid: template.publicTid,
          kidList: template.kidList
        });
        continue;
      }

      const added = await addTemplate(accessToken, template);
      result.templates.push({
        code: template.code,
        title: template.title,
        action: "added",
        priTmplId: added.priTmplId,
        publicTid: template.publicTid,
        kidList: template.kidList
      });
    }
  } catch (error) {
    result.status = "failed";
    result.errors.push({
      target: targetName,
      message: error.message
    });
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.templates || !args.targets) {
    throw new Error(`Missing --templates or --targets.${usage()}`);
  }

  const templateConfigs = loadTemplateConfigs(args.templates);
  validateTemplateConfigs(templateConfigs);

  const targets = readJson(args.targets);
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("Targets JSON must be a non-empty array.");
  }

  const dryRun = Boolean(args.dryRun);
  const results = [];

  console.log(`Loaded ${templateConfigs.length} templates.`);
  console.log(`Loaded ${targets.length} target mini programs.`);
  if (dryRun) console.log("Dry run mode: addtemplate will not be called.");

  for (const target of targets) {
    const label = target.name || target.appid || "unnamed";
    console.log(`Processing ${label}...`);
    results.push(await processTarget(target, templateConfigs, dryRun));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    dryRun,
    templateCount: templateConfigs.length,
    targetCount: targets.length,
    results
  };

  const outPath = args.out || defaultOutputPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Output: ${path.resolve(outPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
