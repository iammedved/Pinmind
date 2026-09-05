function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripQuotedExamples(value) {
  return value
    .replace(/```[^]*?(?:```|$)/gu, ' ')
    .replace(/`/gu, ' ')
    .replace(/["“«][^"”»]{0,1000}["”»]/gu, ' ');
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function routeDesignSkills(input = {}) {
  const raw = normalize(input.text || input.intent || input.request || '');
  const text = stripQuotedExamples(raw);
  const signals = [];
  const mark = (condition, signal) => {
    if (condition) signals.push(signal);
    return condition;
  };

  const impeccableExplicit = mark(
    /(?:^|\s)(?:\$|\/|@)?impeccable(?=\s|[,:;.!?/-]|$)|(?:импек+абл|импик+абл)/u.test(text),
    'explicit:impeccable',
  );
  const proMaxExplicit = mark(
    /(?:^|\s)(?:\$|\/|@)?ui[- /]?ux[- /]?pro[- /]?max(?=\s|[,:;.!?/-]|$)|(?:уи|юи)[- /]?укс[- /]?про[- /]?макс/u.test(text),
    'explicit:ui-ux-pro-max',
  );
  const impeccableCommand = mark(
    /(?:^|\s)(?:init|teach|shape|document|extract|critique|audit|polish|bolder|quieter|distill|harden|onboard|animate|colorize|typeset|layout|delight|overdrive|clarify|adapt|optimize|live)(?=\s|[,:;.!?/-]|$)/u.test(text)
      && impeccableExplicit,
    'workflow:impeccable-command',
  );

  const visualObject = mark(
    /\b(?:ui|ux|frontend|interface|screen|page|website|landing|dashboard|component|modal|dialog|drawer|form|navigation|hero|layout|responsive|mobile|tablet|desktop|design system|figma|mockup|prototype)\b|(?:интерфейс|экран|страниц|сайт|лендинг|дашборд|компонент|модал|диалог|форма|навигац|перв(?:ый|ого) экран|адаптив|мобильн|планшет|десктоп|дизайн-систем|фигм|макет|прототип)/u.test(text),
    'domain:interface',
  );
  const visualActionDetected = /\b(?:design|redesign|build|implement|create|fix|improve|polish|audit|review|adapt|animate|typeset|colorize|update|move|add|remove|delete|replace)\b|(?:спроектир|разработ|переработ|созда|сдела|исправ|улучш|доработ|обнов|перенес|добав|удал|замен|отполир|проверь|аудит|адаптир|анимир|типограф|цвет|реализ)/u.test(text);
  const visualAction = mark(
    visualActionDetected && (visualObject || impeccableExplicit || proMaxExplicit),
    'intent:design-action',
  );
  const inquiryAction = /\b(?:search|find|choose|select|recommend|compare)\b|(?:найд|подбер|выбер|порекоменду|сравн)/u.test(text);
  const designKnowledge = /\b(?:palette|color|typography|font|design pattern|ux pattern|guideline|icon|chart|gsap|accessibility|a11y|focus state|touch target|contrast)\b|(?:палитр|цвет|типограф|шрифт|дизайн-паттерн|ux-паттерн|правил\S* (?:ux|доступност)|рекомендац\S* (?:ux|ui)|икон|график|доступност|фокус|контраст|локальн\S* баз\S* (?:паттерн|дизайн))/u.test(text);
  const intelligenceNeed = mark(
    designKnowledge && (inquiryAction || visualActionDetected || proMaxExplicit),
    'need:design-intelligence',
  );
  const interactiveStatusCard = mark(
    /\b(?:status\s+card|card\s+status)\b|карточк\S*\s+статус\S*/u.test(text)
      && /\b(?:click|tap|keyboard|focus)\b|(?:клик|нажат|клавиатур|фокус)/u.test(text)
      && /\b(?:visual(?:ly)?|current style|existing style)\b|(?:визуаль|текущ\S*\s+стил)/u.test(text)
      && visualActionDetected,
    'intent:interactive-status-card',
  );

  const breadth = countMatches(text, [
    /(?:адаптив|responsive|mobile|tablet|desktop)/u,
    /(?:анимац|motion|animate|interaction|микровзаимод)/u,
    /(?:форм|modal|dialog|navigation|навигац)/u,
    /(?:accessibility|a11y|доступност|focus|keyboard|клавиатур)/u,
    /(?:палитр|color|цвет|typography|font|типограф|шрифт)/u,
  ]);
  if (breadth >= 2) signals.push('scope:multi-concern-ui');

  const designTask = impeccableExplicit || proMaxExplicit || intelligenceNeed || (visualObject && visualAction) || interactiveStatusCard;
  if (!designTask) {
    return {
      designTask: false,
      primarySkill: null,
      supportingSkills: [],
      reason: 'The request does not change or evaluate a visual interface.',
      signals,
    };
  }

  if (impeccableExplicit && !proMaxExplicit && (impeccableCommand || !intelligenceNeed)) {
    return {
      designTask: true,
      primarySkill: 'impeccable',
      supportingSkills: [],
      reason: 'An explicit Impeccable workflow owns the requested design lifecycle.',
      signals,
    };
  }

  const substantiveWork = (visualObject && visualAction) || interactiveStatusCard;
  const compose = (impeccableExplicit && proMaxExplicit)
    || (substantiveWork && (intelligenceNeed || breadth >= 2));
  if (compose) {
    return {
      designTask: true,
      primarySkill: 'impeccable',
      supportingSkills: ['ui-ux-pro-max'],
      reason: 'Impeccable owns the interface workflow; UI/UX Pro Max supplies targeted, searchable design evidence.',
      signals,
    };
  }

  if (proMaxExplicit || intelligenceNeed) {
    return {
      designTask: true,
      primarySkill: 'ui-ux-pro-max',
      supportingSkills: [],
      reason: 'The request needs a focused lookup in the local UI/UX design-intelligence corpus.',
      signals,
    };
  }

  return {
    designTask: true,
    primarySkill: 'impeccable',
    supportingSkills: [],
    reason: 'A visual interface change needs one end-to-end design workflow owner.',
    signals,
  };
}
