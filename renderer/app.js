// ==============================
// App State (in-memory, no files)
// ==============================
let exportedTemplates = [];
let targetsData = [];
let addResultsState = null;

// ==============================
// Tab switching
// ==============================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = document.getElementById(`tab-${btn.dataset.tab}`);
    if (tab) tab.classList.add("active");
  });
});

// ==============================
// Logging
// ==============================
const logOutput = document.getElementById("log-output");

function log(text, type) {
  const placeholder = logOutput.querySelector(".log-placeholder");
  if (placeholder) placeholder.remove();
  const line = document.createElement("div");
  line.textContent = text;
  if (type === "stderr" || type === "error") line.style.color = "#e74c3c";
  logOutput.appendChild(line);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLog() {
  if (confirm("确定清空所有日志吗？")) {
    logOutput.innerHTML = '<span class="log-placeholder">操作日志将显示在这里...</span>';
  }
}
document.getElementById("btn-clear-log").addEventListener("click", clearLog);

// ==============================
// Password visibility toggle (delegated for static + dynamic buttons)
// ==============================
document.addEventListener("click", function(e) {
  var btn = e.target.closest(".btn-pwd-toggle");
  if (!btn) return;

  var input;
  var targetId = btn.getAttribute("data-target");
  if (targetId) {
    // Export tab: data-target points to an element ID
    input = document.getElementById(targetId);
  } else {
    // Targets tab: input is a sibling inside the same .pwd-wrap
    input = btn.parentElement.querySelector("input");
  }
  if (!input) return;

  var isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  btn.textContent = isPassword ? "👁‍🗨" : "👁";
});

// ==============================
// API bridge (safe wrapper)
// ==============================
const W = window;
const bridge = W.api || { onScriptLog: function() {} };

bridge.onScriptLog(function(data) {
  log(data.text, data.type);
});

// ==============================
// Export Tab
// ==============================
const srcAppid = document.getElementById("src-appid");
const srcSecret = document.getElementById("src-secret");
const srcToken = document.getElementById("src-token");
const btnExport = document.getElementById("btn-export");

async function loadEnv() {
  const env = await bridge.readEnv();
  if (env.WECHAT_APPID) srcAppid.value = env.WECHAT_APPID;
  if (env.WECHAT_SECRET) srcSecret.value = env.WECHAT_SECRET;
  if (env.WECHAT_ACCESS_TOKEN) srcToken.value = env.WECHAT_ACCESS_TOKEN;
}

function saveEnv() {
  return bridge.writeEnv({
    WECHAT_APPID: srcAppid.value,
    WECHAT_SECRET: srcSecret.value,
    WECHAT_ACCESS_TOKEN: srcToken.value,
  });
}

const exportResults = document.getElementById("export-results");
const exportTbody = document.getElementById("export-tbody");
const exportCount = document.getElementById("export-count");

function escHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Generate a clickable summary of field count */
function fieldSummary(t, rowId) {
  var fields = t.fields || [];
  if (fields.length > 0) {
    return "<span class=\"field-toggle-link\" data-target=\"" + rowId + "\" data-count=\"" + fields.length + "\">" + fields.length + " 个字段 ▶ 点击展开</span>";
  }
  if (t.kidList && t.kidList.length > 0) {
    return "kidList: [" + t.kidList.join(", ") + "]";
  }
  return "-";
}

/** Generate the field detail sub-table HTML */
function fieldDetailHtml(fields) {
  if (!fields || fields.length === 0) return "无字段信息";

  var html = '<table class="field-table">' +
    '<thead><tr><th>#</th><th>字段名</th><th>Value Key</th><th>Kid</th><th>示例值</th></tr></thead>' +
    '<tbody>';

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    html += "<tr>" +
      "<td>" + (f.index || i + 1) + "</td>" +
      "<td><strong>" + escHtml(f.name) + "</strong></td>" +
      "<td><code>" + escHtml(f.valueKey || "") + "</code></td>" +
      "<td>" + (f.kid != null ? f.kid : "-") + "</td>" +
      "<td class=\"field-example\">" + escHtml(f.example || "") + "</td>" +
      "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

/** Attach click-to-toggle on field summary cells */
function bindFieldToggles(container) {
  var toggles = container.querySelectorAll(".field-toggle-link");
  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener("click", function() {
      var rowId = this.getAttribute("data-target");
      var row = document.getElementById(rowId);
      if (row) {
        var hidden = row.style.display === "none" || row.style.display === "";
        row.style.display = hidden ? "table-row" : "none";
        var count = this.getAttribute("data-count") || "?";
        this.textContent = hidden
          ? (count + " 个字段 ▼ 点击收起")
          : (count + " 个字段 ▶ 点击展开");
      }
    });
  }
}

function renderExportResults() {
  if (!exportedTemplates || exportedTemplates.length === 0) {
    exportResults.style.display = "none";
    return;
  }
  exportResults.style.display = "block";
  exportCount.textContent = exportedTemplates.length;

  var html = "";
  for (var i = 0; i < exportedTemplates.length; i++) {
    var t = exportedTemplates[i];
    var rowId = "exp-field-" + i;
    html += "<tr class=\"tmpl-row\">" +
      "<td>" + (i + 1) + "</td>" +
      "<td><strong>" + escHtml(t.title) + "</strong></td>" +
      "<td>" + escHtml(t.typeName || String(t.type || "")) + "</td>" +
      "<td>" + (t.publicTid ?? "-") + "</td>" +
      "<td class=\"kid-list\">" + fieldSummary(t, rowId) + "</td>" +
      "<td>" + escHtml(t.sceneDesc || "") + "</td>" +
      "</tr>" +
      "<tr id=\"" + rowId + "\" class=\"fields-detail\" style=\"display:none\">" +
      "<td colspan=\"6\">" + fieldDetailHtml(t.fields) + "</td>" +
      "</tr>";
  }
  exportTbody.innerHTML = html;
  bindFieldToggles(exportTbody);
}

btnExport.addEventListener("click", async function() {
  // Validate: at least one auth method
  if (!srcAppid.value && !srcToken.value) {
    log("\n⚠️ 请填写 AppID，或使用已有 Access Token。", "error");
    return;
  }
  if (srcAppid.value && !srcSecret.value && !srcToken.value) {
    log("\n⚠️ 填写 AppID 后请同时填写 Secret，或改用 Access Token。", "error");
    return;
  }

  await saveEnv();
  log("\n✅ 源小程序配置已保存到 .env");
  btnExport.disabled = true;
  btnExport.innerHTML = "⏳ 正在导出...";

  log("=== 开始导出模板 ===\n");

  try {
    var data = await bridge.exportTemplates({
      appid: srcAppid.value || undefined,
      secret: srcSecret.value || undefined,
      accessToken: srcToken.value || undefined,
    });

    if (data && data.templates) {
      exportedTemplates = data.templates;
      resetSelection();
      renderExportResults();
      // Persist to file for next session
      bridge.saveCurrentTemplates(exportedTemplates);
      log("\n✅ 导出完成，共 " + exportedTemplates.length + " 个模板");
      log("💡 请切换到「批量添加」标签页继续操作。");

      // Pre-switch to add tab to refresh its status (user will see it when they navigate)
      updateAddStatus();
    } else {
      log("\n⚠️ 导出完成，但未找到模板数据。");
      log("提示: 如果源小程序没有创建过订阅消息模板，导出结果为空是正常的。");
    }
  } catch (err) {
    log("\n❌ 导出失败: " + (err.message || String(err)), "error");
  } finally {
    btnExport.disabled = false;
    btnExport.innerHTML = "🚀 导出模板";
  }
});

// ==============================
// Targets Tab
// ==============================
const targetsList = document.getElementById("targets-list");
const btnAddTarget = document.getElementById("btn-add-target");
const btnSaveTargets = document.getElementById("btn-save-targets");

function renderTargets() {
  if (targetsData.length === 0) {
    targetsList.innerHTML = '<p class="empty-hint">暂无目标小程序，点击上方按钮添加。</p>';
    return;
  }
  targetsList.innerHTML = "";
  var template = document.getElementById("target-row-template");

  for (var idx = 0; idx < targetsData.length; idx++) {
    (function(index) {
      var t = targetsData[index];
      var clone = template.content.cloneNode(true);

      clone.querySelector(".target-name").value = t.name || "";
      clone.querySelector(".target-appid").value = t.appid || "";
      clone.querySelector(".target-secret").value = t.secret || "";
      clone.querySelector(".target-token").value = t.accessToken || "";

      clone.querySelector(".target-name").addEventListener("input", function(e) {
        targetsData[index].name = e.target.value;
      });
      clone.querySelector(".target-appid").addEventListener("input", function(e) {
        targetsData[index].appid = e.target.value;
      });
      clone.querySelector(".target-secret").addEventListener("input", function(e) {
        targetsData[index].secret = e.target.value;
      });
      clone.querySelector(".target-token").addEventListener("input", function(e) {
        targetsData[index].accessToken = e.target.value;
      });
      clone.querySelector(".btn-remove-target").addEventListener("click", function() {
        if (confirm("确定移除目标「" + (targetsData[index].name || targetsData[index].appid || "未命名") + "」吗？")) {
          targetsData.splice(index, 1);
          renderTargets();
          bridge.writeTargets(targetsData);
        }
      });

      targetsList.appendChild(clone);
    })(idx);
  }
}

async function loadTargets() {
  try {
    targetsData = await bridge.readTargets();
  } catch (e) {
    targetsData = [];
  }
  renderTargets();
}

btnAddTarget.addEventListener("click", function() {
  targetsData.push({ name: "", appid: "", secret: "", accessToken: "" });
  renderTargets();
  bridge.writeTargets(targetsData).then(function() {
    log("✅ 已自动保存目标小程序列表");
  });
});

btnSaveTargets.addEventListener("click", async function() {
  targetsData = targetsData.filter(function(t) {
    return t.appid && (t.secret || t.accessToken);
  });
  await bridge.writeTargets(targetsData);
  renderTargets();
  log("✅ 目标小程序列表已保存到 targets.json");
});

// ==============================
// Add Templates Tab
// ==============================
const statusTemplates = document.getElementById("status-templates-value");
const statusTargets = document.getElementById("status-targets-value");
const statusReady = document.getElementById("status-ready-value");
const addPreview = document.getElementById("add-preview");
const addPreviewTbody = document.getElementById("add-preview-tbody");
const btnAddDryrun = document.getElementById("btn-add-dryrun");
const btnAddExecute = document.getElementById("btn-add-execute");
const addResultsEl = document.getElementById("add-results");
const addResultsContent = document.getElementById("add-results-content");
const selAllCheckbox = document.getElementById("sel-all-checkbox");
const btnSelAll = document.getElementById("btn-sel-all");
const btnSelNone = document.getElementById("btn-sel-none");
const selectionCount = document.getElementById("selection-count");

// Selection state: true = included, all selected by default
var templateSelection = [];

function resetSelection() {
  templateSelection = [];
  for (var i = 0; i < exportedTemplates.length; i++) {
    templateSelection.push(true);
  }
}

function selectedTemplateCount() {
  var count = 0;
  for (var i = 0; i < templateSelection.length; i++) {
    if (templateSelection[i]) count++;
  }
  return count;
}

function getSelectedTemplates() {
  var result = [];
  for (var i = 0; i < exportedTemplates.length; i++) {
    if (templateSelection[i]) result.push(exportedTemplates[i]);
  }
  return result;
}

function updateSelectionUI() {
  var sel = selectedTemplateCount();
  var total = exportedTemplates.length;
  selectionCount.textContent = sel + " / " + total + " 已选";
  selAllCheckbox.checked = sel === total;
  selAllCheckbox.indeterminate = sel > 0 && sel < total;

  var canRun = sel > 0;
  btnAddDryrun.disabled = !canRun;
  btnAddExecute.disabled = !canRun;
}

function updateAddStatus() {
  var hasTemplates = exportedTemplates.length > 0;
  var validTargets = targetsData.filter(function(t) {
    return t.appid && (t.secret || t.accessToken);
  });
  var hasTargets = validTargets.length > 0;

  if (hasTemplates) {
    statusTemplates.textContent = exportedTemplates.length + " 个模板已加载";
    statusTemplates.className = "status-value ok";
  } else {
    statusTemplates.textContent = "未导出 — 请先在「导出模板」中导出";
    statusTemplates.className = "status-value err";
  }

  if (hasTargets) {
    statusTargets.textContent = validTargets.length + " 个目标已配置";
    statusTargets.className = "status-value ok";
  } else if (targetsData.length > 0) {
    statusTargets.textContent = "请填写 AppID + Secret/Token";
    statusTargets.className = "status-value warn";
  } else {
    statusTargets.textContent = "未配置 — 请先在「目标小程序」中添加";
    statusTargets.className = "status-value err";
  }

  var selCount = selectedTemplateCount();
  var ready = hasTemplates && hasTargets && selCount > 0;
  if (ready) {
    statusReady.textContent = "就绪，可执行 (" + selCount + " 个模板)";
    statusReady.className = "status-value ok";
  } else if (hasTemplates && hasTargets && selCount === 0) {
    statusReady.textContent = "请至少选择一个模板";
    statusReady.className = "status-value warn";
  } else {
    statusReady.textContent = "数据不完整";
    statusReady.className = "status-value err";
  }

  if (hasTemplates) {
    addPreview.style.display = "block";
    // Ensure selection array matches template count
    while (templateSelection.length < exportedTemplates.length) templateSelection.push(true);
    while (templateSelection.length > exportedTemplates.length) templateSelection.pop();

    var html = "";
    for (var i = 0; i < exportedTemplates.length; i++) {
      var t = exportedTemplates[i];
      var rowId = "add-preview-field-" + i;
      var checked = templateSelection[i] ? "checked" : "";
      html += "<tr class=\"tmpl-row\">" +
        "<td class=\"chk-cell\"><input type=\"checkbox\" class=\"tmpl-chk\" data-idx=\"" + i + "\" " + checked + "></td>" +
        "<td>" + escHtml(t.title) + "</td>" +
        "<td>" + (t.publicTid ?? "-") + "</td>" +
        "<td class=\"kid-list\">" + fieldSummary(t, rowId) + "</td>" +
        "<td>" + escHtml(t.sceneDesc || "") + "</td>" +
        "</tr>" +
        "<tr id=\"" + rowId + "\" class=\"fields-detail\" style=\"display:none\">" +
        "<td colspan=\"5\">" + fieldDetailHtml(t.fields) + "</td>" +
        "</tr>";
    }
    addPreviewTbody.innerHTML = html;
    bindFieldToggles(addPreviewTbody);
    bindCheckboxListeners();
    updateSelectionUI();
  } else {
    addPreview.style.display = "none";
  }
}

async function runAddTemplates(dryRun) {
  var label = dryRun ? "Dry-Run 检查" : "批量添加";
  var btn = dryRun ? btnAddDryrun : btnAddExecute;

  // Validate targets
  var validTargets = targetsData.filter(function(t) {
    return t.appid && (t.secret || t.accessToken);
  });
  if (validTargets.length === 0) {
    log("\n❌ 没有可用的目标小程序。请先在「目标小程序」标签页中添加并保存有效的目标。", "error");
    return;
  }

  // Validate selected templates
  var selected = getSelectedTemplates();
  if (selected.length === 0) {
    log("\n❌ 请至少选择一个模板。", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "⏳ 正在" + (dryRun ? "检查" : "添加") + "...";

  // Log in background, stay on current page
  log("\n=== 开始" + label + " ===\n");
  log("模板: " + selected.length + " 个 (已选) | 目标: " + validTargets.length + " 个小程序\n");

  try {
    var result = await bridge.addTemplates({
      templates: selected,
      targets: validTargets,
      dryRun: dryRun,
    });

    addResultsState = result;
    renderAddResults(dryRun);
    log("\n✅ " + label + "完成！");
  } catch (err) {
    log("\n❌ " + label + "失败: " + (err.message || String(err)), "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = dryRun ? "🔍 Dry-Run 检查" : "📥 执行批量添加";
  }
}

function renderAddResults() {
  if (!addResultsState) return;
  addResultsEl.style.display = "block";

  var results = addResultsState.results || [];
  if (results.length === 0) {
    addResultsContent.innerHTML = "<p>无返回结果。</p>";
    return;
  }

  var html = "";
  for (var rIdx = 0; rIdx < results.length; rIdx++) {
    var r = results[rIdx];
    var statusClass = r.status === "ok" ? "ok" : "fail";
    var statusLabel = r.status === "ok" ? "成功" : "失败";

    html += '<div class="result-target-card">' +
      '<div class="result-target-header">' +
      '<span>' + escHtml(r.name || r.appid) + '</span>' +
      '<span class="status-tag ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>';

    if (r.errors && r.errors.length > 0) {
      html += '<ul class="error-list">';
      for (var eIdx = 0; eIdx < r.errors.length; eIdx++) {
        html += '<li>' + escHtml(r.errors[eIdx].message) + '</li>';
      }
      html += '</ul>';
    }

    if (r.templates && r.templates.length > 0) {
      html += '<div class="result-target-body"><table>' +
        '<thead><tr><th>标题</th><th>操作</th><th>模板 ID (priTmplId)</th></tr></thead>' +
        '<tbody>';
      for (var tIdx = 0; tIdx < r.templates.length; tIdx++) {
        var t = r.templates[tIdx];
        var actionMap = {
          added: "✅ 已添加",
          skipped_existing: "⏭️ 已存在",
          would_add: "🔍 将会添加",
        };
        html += '<tr>' +
          '<td>' + escHtml(t.title) + '</td>' +
          '<td>' + (actionMap[t.action] || t.action) + '</td>' +
          '<td>' + (t.priTmplId || "-") + '</td>' +
          '</tr>';
      }
      html += '</tbody></table></div>';
    }

    html += '</div>';
  }

  addResultsContent.innerHTML = html;
  // Scroll to show results
  addResultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindCheckboxListeners() {
  var chks = addPreviewTbody.querySelectorAll(".tmpl-chk");
  for (var i = 0; i < chks.length; i++) {
    chks[i].addEventListener("change", function() {
      var idx = parseInt(this.getAttribute("data-idx"), 10);
      templateSelection[idx] = this.checked;
      updateSelectionUI();
      updateReadyStatus();
    });
  }
}

function updateReadyStatus() {
  var selCount = selectedTemplateCount();
  var hasTargets = targetsData.filter(function(t) {
    return t.appid && (t.secret || t.accessToken);
  }).length > 0;
  if (selCount > 0 && hasTargets) {
    statusReady.textContent = "就绪，可执行 (" + selCount + " 个模板)";
    statusReady.className = "status-value ok";
  } else if (selCount === 0 && exportedTemplates.length > 0) {
    statusReady.textContent = "请至少选择一个模板";
    statusReady.className = "status-value warn";
  } else {
    statusReady.textContent = "数据不完整";
    statusReady.className = "status-value err";
  }
}

selAllCheckbox.addEventListener("change", function() {
  var checked = selAllCheckbox.checked;
  for (var i = 0; i < templateSelection.length; i++) {
    templateSelection[i] = checked;
  }
  // Update all checkbox inputs in the table
  var chks = addPreviewTbody.querySelectorAll(".tmpl-chk");
  for (var i = 0; i < chks.length; i++) {
    chks[i].checked = checked;
  }
  updateSelectionUI();
  updateReadyStatus();
});

btnSelAll.addEventListener("click", function() {
  selAllCheckbox.checked = true;
  selAllCheckbox.dispatchEvent(new Event("change"));
});

btnSelNone.addEventListener("click", function() {
  selAllCheckbox.checked = false;
  selAllCheckbox.dispatchEvent(new Event("change"));
});

btnAddDryrun.addEventListener("click", function() { runAddTemplates(true); });
btnAddExecute.addEventListener("click", function() { runAddTemplates(false); });

var addTabBtn = document.querySelector('[data-tab="add"]');
if (addTabBtn) addTabBtn.addEventListener("click", updateAddStatus);

async function loadSavedTemplates() {
  try {
    var data = await bridge.loadCurrentTemplates();
    if (data && data.templates && data.templates.length > 0) {
      exportedTemplates = data.templates;
      resetSelection();
      renderExportResults();
      updateAddStatus();
      log("📂 已恢复上次导出的 " + exportedTemplates.length + " 个模板");
    }
  } catch (e) {
    // No saved templates — first run, that's fine
  }
}

// ==============================
// Init
// ==============================
async function init() {
  try {
    await loadEnv();
    await loadTargets();
    await loadSavedTemplates();
  } catch (err) {
    log("初始化失败: " + (err && err.message ? err.message : String(err)), "error");
  }
}
init();
