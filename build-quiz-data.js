const fs = require("fs");
const path = require("path");
const https = require("https");

const SOURCE_URL = "https://suareceitinha.receitinhaplenanatural.online/";
const ROOT = __dirname;
const ASSETS_DIR = path.join(ROOT, "assets");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function extractObject(text, key) {
  const keyIndex = text.indexOf(key);
  if (keyIndex < 0) throw new Error(`Key not found: ${key}`);
  const start = text.indexOf("{", keyIndex);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("Could not close JSON object");
}

function clean(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function assetFor(uuid) {
  if (!uuid) return "";
  const found = fs
    .readdirSync(ASSETS_DIR)
    .find((file) => file.toLowerCase().includes(String(uuid).toLowerCase()));
  return found ? `assets/${found}` : `https://cdn.xquiz.co/images/${uuid}`;
}

function dataImage(image) {
  return image?.uuid ? assetFor(image.uuid) : "";
}

function firstByType(page, types) {
  return (page.data.content || []).find((component) => types.includes(component.type));
}

function inferType(page) {
  const types = (page.data.content || []).map((component) => component.type);
  if (types.includes("loading")) return "loading";
  if (types.includes("form")) return "form";
  if (types.includes("weightV2") || types.includes("heightV2")) return "measure";
  if (types.includes("quiz")) return "single_choice";
  if (types.includes("script")) return "multiple_choice";
  if (types.includes("testimony") || types.includes("carousel")) return "testimonial";
  if (types.includes("video") && types.includes("button")) return "offer";
  if (types.includes("audio") || types.includes("result") || types.includes("report")) return "result";
  return "content";
}

function componentToElement(component, outgoingByHandle) {
  const data = component.data || {};
  const base = { id: component.id, component: component.type };

  if (component.type === "headerV2" || component.type === "headerV3") {
    return { ...base, type: "header", logo: assetFor(data.logo?.uuid), logoSize: data.logo?.size || 70 };
  }
  if (component.type === "progressV2" || component.type === "progressV3") {
    return { ...base, type: "progress" };
  }
  if (component.type === "title") {
    return {
      ...base,
      type: "title",
      title: clean(data.title),
      subtitle: clean(data.subtitle),
      alignment: data.alignment || "center",
    };
  }
  if (component.type === "text" || component.type === "textV2" || component.type === "textV3") {
    return { ...base, type: "text", text: clean(data.text), alignment: data.textAlignment || data.alignment || "center" };
  }
  if (component.type === "image") {
    return { ...base, type: "image", src: dataImage(data.image), size: data.size || "w-full" };
  }
  if (component.type === "button" || component.type === "buttonV3") {
    return { ...base, type: "button", text: clean(data.title), animation: data.animation || "none" };
  }
  if (component.type === "quiz") {
    const options = (data.content || [])
      .filter((item) => !item.deleted)
      .map((item) => ({
        id: item.id,
        label: clean(item.title),
        emoji: item.emoji || "",
        image: dataImage(item.image),
        value: clean(item.title),
        nextStep: outgoingByHandle[item.id] || "",
      }));
    return {
      ...base,
      type: "options",
      model: data.model || "text-only",
      columns: data.columns || "grid-cols-1",
      multiple: Boolean(data.multiple || data.checkbox === "checkbox"),
      placement: data.placement || "image-left",
      colors: data.colors || {},
      options,
    };
  }
  if (component.type === "form") {
    return {
      ...base,
      type: "form",
      buttonText: clean(data.buttonTitle) || "Continuar",
      fields: (data.content || []).map((field) => ({
        id: field.id,
        name: clean(field.title).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: clean(field.title),
        placeholder: field.placeholder || "",
        required: Boolean(field.required),
      })),
    };
  }
  if (component.type === "weightV2" || component.type === "heightV2") {
    return {
      ...base,
      type: component.type === "heightV2" ? "height" : "weight",
      label: clean(data.title) || (component.type === "heightV2" ? "Altura" : "Peso"),
    };
  }
  if (component.type === "note") {
    return { ...base, type: "note", title: clean(data.title), text: clean(data.text) };
  }
  if (component.type === "loading") {
    return { ...base, type: "loading", delay: data.delay || 2200 };
  }
  if (component.type === "redirect") {
    return { ...base, type: "redirect" };
  }
  if (component.type === "video") {
    return { ...base, type: "video", title: clean(data.title), src: data.url || data.src || "" };
  }
  if (component.type === "audio") {
    return { ...base, type: "audio", image: dataImage(data.image), title: clean(data.title) };
  }
  if (component.type === "testimony") {
    return { ...base, type: "testimony", text: clean(data.text), image: dataImage(data.image) };
  }
  if (component.type === "carousel") {
    return {
      ...base,
      type: "carousel",
      items: (data.content || []).map((item) => ({ title: clean(item.title), image: dataImage(item.image), text: clean(item.text) })),
    };
  }
  if (component.type === "report") {
    return { ...base, type: "report", title: clean(data.title), image: dataImage(data.image), text: clean(data.text) };
  }
  if (component.type === "chart") {
    return { ...base, type: "chart", items: (data.content || []).map((item) => ({ label: clean(item.title), value: clean(item.value) })) };
  }
  if (component.type === "result") {
    return { ...base, type: "resultBox", title: clean(data.title), text: clean(data.text) };
  }
  if (component.type === "transform") {
    return { ...base, type: "transform" };
  }
  if (component.type === "script") {
    return {
      ...base,
      type: "bodyMap",
      image: "assets/imageye___-_imgi_7_0w1ynIh.png",
      markers: ["Costas", "Braços", "Barriga", "Pochete", "Flanco", "Culotes", "Pernas", "Coxa"],
    };
  }
  return { ...base, type: "unknown", rawType: component.type };
}

async function main() {
  const html = await get(SOURCE_URL);
  const chunks = [];
  const regex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
  let match;
  while ((match = regex.exec(html))) chunks.push(JSON.parse(`"${match[1]}"`));
  const funnel = JSON.parse(extractObject(chunks.join(""), '"funnel"'));
  const nodesById = Object.fromEntries(funnel.nodes.map((node) => [node.id, node]));
  const outgoing = {};
  funnel.edges.forEach((edge) => {
    (outgoing[edge.source] ||= []).push(edge);
  });

  const reachable = new Set();
  const order = [];
  const queue = (outgoing.root || []).map((edge) => edge.target);
  while (queue.length) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = nodesById[id];
    if (!node) continue;
    if (node.type === "page") order.push(id);
    (outgoing[id] || []).forEach((edge) => queue.push(edge.target));
  }

  const redirectNodes = funnel.nodes
    .filter((node) => node.type === "function" && node.data?.type === "link")
    .map((node) => ({ id: `redirect_${node.id}`, nodeId: node.id, url: node.data.url }));

  const progressBySlug = {
    "6k4g1l4z": 10,
    "1c0i6f1v": 15,
    "5g046s2m": 30,
    "4q653t6d": 35,
    "493q0e2p": 40,
    "0s0v1f3a": 42,
    "5j3r5y73": 45,
    "3h095o15": 50,
    "612s444y": 55,
    "6y2b4r5m": 63,
    "3s6v580n": 67,
    "1j4p1y70": 70,
    "5a0c0q1i": 73,
    "0w3h0r59": 75,
    "2z2f0305": 79,
    "3z6v156l": 82,
    "723i3h2s": 83,
    "4h6q6p11": 84,
    "4y5a5r0s": 92,
    "6n0q354o": 95,
    "095h1g2n": 96,
    "5u421x6n": 98,
    "5z4m153b": 99,
  };
  const pageCount = order.length;
  const steps = order.map((id, index) => {
    const page = nodesById[id];
    const handleNext = {};
    (outgoing[id] || []).forEach((edge) => {
      const target = nodesById[edge.target];
      handleNext[edge.sourceHandle] = target?.type === "function" ? `redirect_${edge.target}` : edge.target;
    });
    const elements = (page.data.content || []).map((component) => componentToElement(component, handleNext));
    const titleElement = elements.find((element) => element.type === "title");
    const imageElement = elements.find((element) => element.type === "image");
    const optionsElement = elements.find((element) => element.type === "options");
    const buttonElement = elements.find((element) => element.type === "button");
    const firstEdge = (outgoing[id] || [])[0];
    const firstTarget = firstEdge ? nodesById[firstEdge.target] : null;
    const nextStep = firstEdge ? (firstTarget?.type === "function" ? `redirect_${firstEdge.target}` : firstEdge.target) : "";
    return {
      id,
      slug: page.data.slug,
      type: index === 0 ? "intro" : inferType(page),
      progress: progressBySlug[page.data.slug] ?? Math.round((index / Math.max(1, pageCount - 1)) * 100),
      title: titleElement?.title || "",
      subtitle: titleElement?.subtitle || "",
      description: "",
      question: titleElement?.title || "",
      image: imageElement?.src || "",
      options: optionsElement?.options || [],
      button: { text: buttonElement?.text || "", visible: Boolean(buttonElement) },
      nextStep,
      loadingDelay: inferType(page) === "loading" ? 5600 : undefined,
      elements,
    };
  });

  redirectNodes.forEach((redirect) => {
    steps.push({
      id: redirect.id,
      type: "redirect",
      progress: 100,
      title: "Redirecionando...",
      subtitle: "",
      description: "",
      question: "",
      image: "",
      options: [],
      button: { text: "", visible: false },
      nextStep: "",
      redirectUrl: redirect.url,
      elements: [{ type: "redirect" }],
    });
  });

  const data = {
    quiz: {
      name: funnel.name,
      sourceUrl: SOURCE_URL,
      theme: {
        primaryColor: funnel.theme.color,
        secondaryColor: "#087d16",
        backgroundColor: "#f8fafc",
        textColor: "#020617",
        mutedTextColor: "#020617",
        fontFamily: "Poppins, Arial, sans-serif",
        logo: assetFor(funnel.theme.logo.uuid),
        favicon: assetFor(funnel.theme.favicon.uuid),
      },
      settings: {
        showProgressBar: true,
        autoAdvance: true,
        saveAnswers: true,
        redirectUrl: "https://checkout.payt.com.br/c9cdb9f714f98780624f1cfb20acb574",
        fallbackRedirectUrl: "https://lastlink.com/p/C618C2DAB/checkout-payment/",
        mobileFirst: true,
        preserveUtm: true,
      },
      steps,
    },
  };

  const startStep = data.quiz.steps[0];
  if (startStep?.elements?.[0]?.type !== "header") {
    startStep.elements.unshift({
      id: "synthetic-start-logo",
      component: "headerV2",
      type: "header",
      logo: data.quiz.theme.logo,
      logoSize: 70,
    });
  }

  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(ROOT, "quiz-data.json"), `${json}\n`);
  fs.writeFileSync(path.join(ROOT, "quiz-data.js"), `window.QUIZ_DATA = ${json};\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
