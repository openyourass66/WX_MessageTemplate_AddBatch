import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_BASE = "https://api.weixin.qq.com";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

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
  node scripts/export-miniapp-templates.mjs --appid wx... --secret ...
  node scripts/export-miniapp-templates.mjs --access-token ...

Options:
  --appid          Mini Program appid. Can also use WECHAT_APPID.
  --secret         Mini Program secret. Can also use WECHAT_SECRET.
  --access-token   Existing access_token. Can also use WECHAT_ACCESS_TOKEN.
  --out            Output JSON path. Default: exports/templates-<appid or token>-<timestamp>.json
  --no-enrich      Only export existing templates, do not match public template tid/kidList.
  --raw            Include raw WeChat response and matching details.
  --pretty         Print full JSON to stdout.
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

async function getAccessToken(appid, secret) {
  const data = await requestJson(`${API_BASE}/cgi-bin/stable_token`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid,
      secret
    })
  });

  if (!data.access_token) {
    throw new Error(`Missing access_token in response: ${JSON.stringify(data)}`);
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in
  };
}

async function getTemplateList(accessToken) {
  const url = new URL(`${API_BASE}/wxaapi/newtmpl/gettemplate`);
  url.searchParams.set("access_token", accessToken);

  const data = await requestJson(url);
  return data.data || [];
}

async function getCategories(accessToken) {
  const url = new URL(`${API_BASE}/wxaapi/newtmpl/getcategory`);
  url.searchParams.set("access_token", accessToken);

  const data = await requestJson(url);
  return data.data || [];
}

async function getPublicTemplateTitles(accessToken, categoryIds) {
  if (categoryIds.length === 0) return [];

  const all = [];
  const limit = 30;
  let start = 0;

  while (true) {
    const url = new URL(`${API_BASE}/wxaapi/newtmpl/getpubtemplatetitles`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("ids", categoryIds.join(","));
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(limit));

    const data = await requestJson(url);
    const page = data.data || [];
    all.push(...page);

    const total = Number(data.count || 0);
    start += limit;
    if (page.length < limit || (total > 0 && start >= total)) break;
  }

  return all;
}

async function getPublicTemplateKeywords(accessToken, tid) {
  const url = new URL(`${API_BASE}/wxaapi/newtmpl/getpubtemplatekeywords`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("tid", String(tid));

  const data = await requestJson(url);
  return data.data || [];
}

function parseTemplateFields(content) {
  const fields = [];
  const seen = new Set();
  const linePattern = /([^:\n\uFF1A]+)[:\uFF1A]\s*\{\{([^}]+)\}\}/g;

  for (const match of (content || "").matchAll(linePattern)) {
    const name = match[1].trim();
    const valueKey = match[2].trim();
    if (!name || seen.has(name)) continue;

    seen.add(name);
    fields.push({
      name,
      valueKey
    });
  }

  return fields;
}

function parseExampleFields(example) {
  const values = new Map();
  const linePattern = /([^:\n\uFF1A]+)[:\uFF1A]\s*([^\n]*)/g;

  for (const match of (example || "").matchAll(linePattern)) {
    const name = match[1].trim();
    const value = match[2].trim();
    if (name) values.set(name, value);
  }

  return values;
}

function templateTypeName(type) {
  if (type === 2) return "\u4E00\u6B21\u6027\u8BA2\u9605";
  if (type === 3) return "\u957F\u671F\u8BA2\u9605";
  return String(type ?? "");
}

function makeCode(title = "") {
  return title
    .replace(/\u63D0\u9192$/, "_reminder")
    .replace(/\u901A\u77E5$/, "_notice")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]+/g, "_");
}

function makeSceneDesc(title = "") {
  return title ? `${title}\u670D\u52A1\u573A\u666F` : "\u8BA2\u9605\u6D88\u606F\u670D\u52A1\u573A\u666F";
}

function normalizeTemplate(template, enrichedTemplate = null) {
  const exampleValues = parseExampleFields(template.example);
  const parsedFields = parseTemplateFields(template.content || "");
  const publicKeywordByName = new Map(
    (enrichedTemplate?.publicKeywords || []).map((item) => [item.name, item])
  );

  const fields = parsedFields.map((field, index) => {
    const publicKeyword = publicKeywordByName.get(field.name);
    return {
      index: index + 1,
      name: field.name,
      valueKey: field.valueKey,
      kid: publicKeyword?.kid ?? null,
      example: exampleValues.get(field.name) || ""
    };
  });

  return {
    title: template.title || "",
    type: template.type,
    typeName: templateTypeName(template.type),
    priTmplId: template.priTmplId || "",
    publicTid: enrichedTemplate?.matchedPublicTemplate?.tid ?? null,
    kidList: enrichedTemplate?.addTemplatePayload?.kidList || [],
    sceneDesc: enrichedTemplate?.addTemplatePayload?.sceneDesc || "",
    fields
  };
}

function choosePublicTemplateMatch(privateTemplate, publicTitles, keywordMap) {
  const fields = parseTemplateFields(privateTemplate.content || "");
  const candidates = publicTitles.filter((item) => item.title === privateTemplate.title);

  for (const candidate of candidates) {
    const keywords = keywordMap.get(String(candidate.tid)) || [];
    const kidList = [];
    let missingKeyword = false;

    for (const field of fields) {
      const keyword = keywords.find((item) => item.name === field.name);
      if (!keyword) {
        missingKeyword = true;
        break;
      }
      kidList.push(keyword.kid);
    }

    if (!missingKeyword && kidList.length > 0) {
      return {
        fields,
        candidates,
        matchedPublicTemplate: candidate,
        keywords,
        kidList,
        confidence: "title_and_keywords"
      };
    }
  }

  return {
    fields,
    candidates,
    matchedPublicTemplate: candidates[0] || null,
    keywords: candidates[0] ? keywordMap.get(String(candidates[0].tid)) || [] : [],
    kidList: [],
    confidence: candidates.length > 0 ? "title_only" : "not_found"
  };
}

async function enrichTemplates(accessToken, categories, templates) {
  const categoryIds = categories.map((item) => item.id).filter((id) => id !== undefined && id !== null);
  const publicTitles = await getPublicTemplateTitles(accessToken, categoryIds);
  const titleSet = new Set(templates.map((item) => item.title).filter(Boolean));
  const relevantTids = publicTitles
    .filter((item) => titleSet.has(item.title))
    .map((item) => item.tid)
    .filter((tid) => tid !== undefined && tid !== null);

  const keywordMap = new Map();
  for (const tid of relevantTids) {
    keywordMap.set(String(tid), await getPublicTemplateKeywords(accessToken, tid));
  }

  const enrichedTemplates = templates.map((template) => {
    const match = choosePublicTemplateMatch(template, publicTitles, keywordMap);
    const payload = match.matchedPublicTemplate && match.kidList.length > 0
      ? {
          code: makeCode(template.title),
          title: template.title,
          tid: match.matchedPublicTemplate.tid,
          kidList: match.kidList,
          sceneDesc: makeSceneDesc(template.title)
        }
      : null;

    return {
      priTmplId: template.priTmplId,
      title: template.title,
      type: template.type,
      content: template.content,
      example: template.example,
      parsedFields: match.fields,
      matchConfidence: match.confidence,
      matchedPublicTemplate: match.matchedPublicTemplate,
      publicKeywords: match.keywords,
      addTemplatePayload: payload,
      publicTemplateCandidates: match.candidates.map((item) => ({
        tid: item.tid,
        title: item.title,
        type: item.type,
        categoryId: item.categoryId
      }))
    };
  });

  return {
    publicTemplateTitleCount: publicTitles.length,
    enrichedTemplates,
    addTemplateConfigs: enrichedTemplates
      .map((item) => item.addTemplatePayload)
      .filter(Boolean),
    unmatchedTemplates: enrichedTemplates
      .filter((item) => !item.addTemplatePayload)
      .map((item) => ({
        priTmplId: item.priTmplId,
        title: item.title,
        matchConfidence: item.matchConfidence,
        parsedFields: item.parsedFields,
        candidateCount: item.publicTemplateCandidates.length
      }))
  };
}

function defaultOutputPath(appidOrToken) {
  const safeName = (appidOrToken || "miniapp").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("exports", `templates-${safeName}-${timestamp}.json`);
}

async function main() {
  loadDotEnv(path.resolve(".env"));

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const appid = args.appid || process.env.WECHAT_APPID;
  const secret = args.secret || process.env.WECHAT_SECRET;
  let accessToken = args.accessToken || process.env.WECHAT_ACCESS_TOKEN;
  let tokenSource = "provided";
  let expiresIn = null;

  if (!accessToken) {
    if (!appid || !secret) {
      throw new Error(`Missing credentials.${usage()}`);
    }

    const tokenResult = await getAccessToken(appid, secret);
    accessToken = tokenResult.accessToken;
    expiresIn = tokenResult.expiresIn;
    tokenSource = "stable_token";
  }

  const [categories, templates] = await Promise.all([
    getCategories(accessToken),
    getTemplateList(accessToken)
  ]);

  const enrichment = args.noEnrich
    ? null
    : await enrichTemplates(accessToken, categories, templates);

  const enrichedByPriTmplId = new Map(
    (enrichment?.enrichedTemplates || []).map((item) => [item.priTmplId, item])
  );
  const fieldTemplates = templates.map((template) => normalizeTemplate(
    template,
    enrichedByPriTmplId.get(template.priTmplId)
  ));

  const result = {
    exportedAt: new Date().toISOString(),
    appid: appid || null,
    templateCount: templates.length,
    templates: fieldTemplates
  };

  if (args.raw) {
    result.raw = {
      tokenSource,
      expiresIn,
      categories,
      templates,
      enrichment
    };
  }

  const outPath = args.out || defaultOutputPath(appid || "access-token");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(`Exported ${templates.length} templates.`);
  console.log(`Output: ${path.resolve(outPath)}`);

  if (templates.length > 0) {
    console.log("");
    console.log("Templates:");
    for (const template of templates) {
      const id = template.priTmplId || template.template_id || "";
      const title = template.title || "";
      console.log(`- ${title} | ${templateTypeName(template.type)} | ${id}`);
    }
  }

  if (enrichment) {
    console.log("");
    console.log(`Matched addtemplate configs: ${enrichment.addTemplateConfigs.length}`);
    if (enrichment.unmatchedTemplates.length > 0) {
      console.log(`Need manual check: ${enrichment.unmatchedTemplates.length}`);
      for (const template of enrichment.unmatchedTemplates) {
        console.log(`- ${template.title} | ${template.matchConfidence} | candidates=${template.candidateCount}`);
      }
    }
  }

  if (args.pretty) {
    console.log("");
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
