// Speech-act router. Nouns such as "code" do not choose a route by themselves.
function classifyConfirmedExternalStatement(text) {
  const match = /(?:^|[.!?]\s*)(?:(?:(?:i\s+am|i'm)\s+(?:(?:an?|the)\s+)?(?:owner|maintainer)\s+(?:and\s+)|я\s+(?:владелец|мейнтейнер)\s+и\s+)?(?:(?:(?:i\s+)?(?:confirm|approve|authorize)|(?:я\s+)?(?:подтверждаю|одобряю|разрешаю))(?=\s|[-:>])[\s:>\-]*)+)/u.exec(text);
  if (!match) return { kind: 'none', text: '' };
  const tail = text.slice(match.index + match[0].length).trim();
  const lead = tail.replace(/^(?:(?:first|then|please|сначала|затем)\s*,?\s*)+/u, '');
  const readOnly = /\?\s*$/u.test(tail)
    || /^(?:do\s+not|don't|never|не)(?=\s|[.,;:!?]|$)/u.test(lead)
    || /^(?:explain|describe|tell|report|объясни|расскажи|опиши|сообщи)(?=\s|[.,;:!?]|$)/u.test(lead)
    || /^(?:(?:the\s+)?docs?|documentation)\s+(?:say|says|state|states|contain|contains)\b|^(?:документац|документ)\S*\s+(?:говор|указыва|содерж)/u.test(lead)
    || /\b(?:is|are)\s+(?:risky|dangerous|safe|documented)\b/u.test(tail)
    || /(?:опасен|опасна|опасно|опасны|безопасен|безопасна|безопасно|безопасны)(?=\s|[.,;:!?]|$)/u.test(tail)
    || /\b(?:pull\s+request|pr)\s+plan\b|\bplan\s+(?:for|of)\s+(?:a\s+)?(?:pull\s+request|pr)\b/u.test(tail);
  if (readOnly) return { kind: 'read-only', text: tail };
  const actionList = /^(?:\b(?:push|merge)\b|\b(?:create|open|submit|prepare|creating)\s+(?:a\s+)?(?:pull\s+request|pr)\b|\bcreation\s+of\s+(?:a\s+)?(?:pull\s+request|pr)\b|создани\S*\s+(?:pull\s+request|pr)(?=\s|[.,;:!?]|$)|(?:см[её]рдж|смердж|смерж|запуш|пуш|отправ)\S*)/u.test(lead);
  return { kind: actionList ? 'action-list' : 'none', text: tail };
}

function quotedSpansStripped(value) {
  return value.replace(/["“”«»`][^"“”«»`]{0,500}["“”«»`]/gu, ' ');
}

function translationFrame(value) {
  return value
    .replace(/\b(?:translate|translation)\b[\s\S]{0,80}?\b(?:this|the|it)\s+(?:sentence|phrase|word|paragraph|text)\s*[:\-–]?\s*[\s\S]*$/u, 'translate this sentence')
    .replace(/\b(?:translate|translation)\b[\s\S]{0,80}?\b(?:sentence|phrase|word|paragraph|text)\s*[:\-–]\s*[\s\S]+$/u, 'translate this sentence')
    .replace(/перевед\S*[\s\S]{0,80}?(?:это|этот|эту|данн\S*)?\s*(?:предложен|фраз|слов|абзац|текст)\s*[:\-–]?\s*[\s\S]*$/u, 'переведи это предложение');
}

function exampleListStripped(value) {
  return value
    .replace(/\b(?:delete|deploy|rotate)(?:\s*\/\s*(?:delete|deploy|rotate))+/gu, ' ')
    .replace(/(?:^|[.!?]\s*)\d+\.\s+[\s\S]+$/u, ' ');
}

function analysisFrame(value, { translation, meta } = {}) {
  let frame = quotedSpansStripped(value);
  if (translation) frame = translationFrame(frame);
  if (meta) frame = exampleListStripped(frame);
  return frame.replace(/\s+/gu, ' ').trim();
}

export function routeTask(input = {}) {
  const normalizedText = String(input.text || input.intent || input.request || '').normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е');
  const explicitInvocation = /^\s*(?:\$pinmind|@pinmind)(?=\s|[,:;.!?]|$)/u.test(normalizedText);
  const text = normalizedText.replace(/^\s*(?:\$pinmind|@pinmind)(?=\s|[,:;.!?]|$)[,:;.!?]?\s*/u, '');
  const explicit = String(input.route || input.kind || '').trim().toLowerCase().replace(/[ _]/g, '-');
  const aliases = new Map([['review', 'audit'], ['audit', 'audit'], ['investigate', 'investigation'], ['investigation', 'investigation'], ['bug', 'investigation'], ['debug', 'investigation'], ['change', 'software-change'], ['software', 'software-change'], ['software-change', 'software-change'], ['operational', 'operational'], ['simple', 'simple'], ['spike', 'spike']]);
  const explicitRoute = aliases.get(explicit);
  const signalSet = new Set(); const mark = (condition, signal) => { if (condition) signalSet.add(signal); return condition; };
  if (explicitInvocation) mark(true, 'activation:explicit');
  if (explicit) mark(true, `explicit:${explicitRoute || 'unknown'}`);
  const typoOnly = /\b(?:fix|correct)(?:\s+(?:the|a|this|that|one))?\s+typos?(?:\s+in\b|\s*:)|(?:исправ|поправ|паправ|пофикс)\S*[^\n]{0,40}опечат/u.test(text);
  const colloquialMutate = mark(/(?:выпил|выпел|выреж|вырез|выкин|вычист|докрут|подкрут|допил|довед|додела)(?:и|йте|ите|ить|уть|ь|й|яй|ять)?(?=\s|[.,;:!?/]|$)|(?:дообучи|доучи|научи)\s+(?:его|ее|её|этот|данн\S*|скилл?|роутер|pinmind)|убер(?:и|ите)\s+(?:токен|подсчет|эту\s+функц|всю\s+эту\s+истори)|не\s+надо\s+считать\s+токен|давай\s+без\s+токен/u.test(text), 'intent:colloquial-mutate');
  const productDesire = mark(/(?:хочу|нужно|надо|нужна),?\s+чтобы\s+(?:это|он|она|скилл?|плагин|pinmind)|(?:хочу|нужно|надо|нужна)[^\n]{0,48}(?:штоб|чтоб[ы]?)[^\n]{0,72}(?:не\s+туп|понимал|распознав|понял|могг?|слышал)|чтобы\s+(?:он|она|скилл?|плагин|это)\s+(?:могг?|понимал|распознавал|стал)|(?:сделай|зделай|сделайте)\s+(?:из\s+(?:этого|него|pinmind)|(?:нормальн\S*|полноценн\S*|норм)\s+(?:скилл?|плагин|skill|plugin))|(?:сделай|зделай)[^\n]{0,64}(?:скилл?|skill|плагин|plugin)[^\n]{0,40}из\s+pinmind|(?:полноценн\S*|нормальн\S*)\s+(?:скилл?|плагин|skill|plugin)\s+для|(?:должен|должна|должно|пусть)\s+(?:точно\s+)?(?:понима|распознава|стать|стал)|хочу\s+(?:нормальн\S*|полноценн\S*)\s+(?:скилл?|плагин)|надо\s+чтобы\s+он\s+слышал/u.test(text), 'intent:product-desire');
  const evalHarness = mark(!/\?\s*$/u.test(text) && /(?:напиши|накидай|добав|продумай)\S*[^\n]{0,56}тест\S*|(?:прогон|прогони)\S*[^\n]{0,40}тест|версионир|доведи\s+до\s+релиза|сделай\s+релиз|(?:в\s+прошлом\s+чате)[^\n]{0,80}(?:докрут|поправ|додел|продолж|правил)/u.test(text), 'intent:eval-harness');
  const opinionRequest = mark(/(?:какие|каковы)\s+(?:теперь\s+)?мысли|что\s+думаешь|как\s+(?:он|оно|это)\s+сейчас|норм\s+или\s+нет|оцени\s+\S+\s+честно|что\s+не\s+так\s+в|ну\s+и\s+как\s+он|(?<![\p{L}\p{N}_])тупик|не\s+имеет\s+смысла|нет\s+смысла|не\s+(?:особо\s+)?поможет|dead\s*ends?|no(?:\s+longer)?\s+(?:make\s+sense|point)|does(?:n'?t| not) make sense|would(?:n'?t| not) help/u.test(text), 'intent:opinion');
  const implementDirective = mark(!typoOnly && (/\b(?:implement|apply (?:this|these) (?:fix|fixes|patch|changes)|make pinmind|change pinmind|update pinmind|fix pinmind)\b|заставь|поправ(?:ь|ляй)|паправь|исправь\s+pinmind/u.test(text) || colloquialMutate || productDesire || evalHarness), 'intent:implement-directive');
  const comparisonRequest = mark(/\b(?:compare|comparison|critique|criticiz(?:e|ing)|who(?:'s| is) better|which(?:\s+\S+){0,4}\s+is better|which is ahead|what(?:'s| is) stronger|side[- ]by[- ]side|criticizing tests?|contrast)\b|(?:сравн|сопостав)\S*|критику|кто\s+лучше|что\s+лучше/u.test(text), 'intent:compare');
  const thinkAct = mark(/\b(?:think about|think how|how (?:could|would) (?:we|i|one)\b|how one could)\b|(?:^|[.!?]\s*|[\s,;:])(?:продумай|подумай(?:те)?)(?=\s|[.,;:!?]|$)|как можно было бы/u.test(text), 'intent:think');
  const nextStepQuestion = mark(/\b(?:what(?:'s| is) the next step|which next step)\b|каким\s+следующ|следующ\S*\s+шаг|какой\s+следующ/u.test(text), 'intent:meta-evaluation');
  const documentationQuestion = mark(!colloquialMutate && !productDesire && !evalHarness && /\b(?:token usage|token line|omit the token|pad simple answers|align the .{0,60} docs?)\b|token usage:\s*unavailable|нужно ли писать|не\s+падд/u.test(text), 'intent:docs-question');
  const routePolicyQuestion = mark(/\?\s*$/u.test(text) && /\bshould\b[\s\S]{0,160}\b(?:software-change|operational|investigation|work loop|token usage)\b|\b(?:stay|remain)\s+software-change\b/u.test(text), 'intent:meta-evaluation');
  const planningEarly = mark(/\b(?:where\s+(?:(?:do|should)\s+)?we\s+start|write\s+(?:a\s+)?sheet|what\s+we(?:'ll| will)\s+do)\b|с\s+чего\s+начн|что\s+мы\s+будем\s+делать|напиши\s+(?:прям\s+)?простын/u.test(text), 'intent:meta-evaluation');
  const metaEvaluation = (comparisonRequest || nextStepQuestion || documentationQuestion || routePolicyQuestion || planningEarly) && !implementDirective;
  const translationIntentEarly = /\b(?:translate|translation)\b|перевед/u.test(text);
  const boundedTextEarly = /\b(?:translate\s+(?:this|it)|(?:this|the)?\s*(?:sentence|phrase|word|paragraph|text))\b|перевед\S*\s+(?:это|этот|эту|его|её|ее)|(?:это|этот|эту|данн\S*)?\s*(?:предложен|фраз|слов|абзац|текст)/u.test(text);
  const productLocalizationEarly = /\b(app|application|site|website|ui|interface|product|project|locali[sz]ation|i18n)\b|приложен|сайт|интерфейс|продукт|проект|локализац/u.test(text);
  const boundedTranslation = translationIntentEarly && boundedTextEarly && !productLocalizationEarly;
  const analysisText = analysisFrame(text, { translation: boundedTranslation, meta: metaEvaluation });
  // External collaboration is modeled separately from software impact. A small
  // action grammar makes the effect and target visible without turning every
  // mention of a PR, branch, or generic verb into mutation authority.
  const externalPlanStatementPattern = /\b(?:prepare|draft|write)\s+(?:a\s+)?plan\b|\b(?:create|draft|prepare|write)\s+(?:a\s+)?(?:pull\s+request|pr)\s+plan\b|\bplan\s+(?:how\s+)?to\s+(?:create|open|submit|merge|push)\b|(?:подготов|состав|напиш)\S*\s+план\S*|план\S*\s+(?:создани|открыти|слияни|merge|push)/u;
  const externalProceduralQuestionPattern = /\bhow\s+(?:(?:should|can|do)\s+(?:i|we)\s+|to\s+)(?:create|open|submit|merge|push)\b|\b(?:can|could|would)\s+you\s+(?:explain|describe|outline)\b[^\n]{0,100}\b(?:create|open|submit|merge|push)\b|^\s*(?:is|are)\s+["'\x60]?(?:git\s+)?(?:merge|push)\b|^\s*is\s+it\s+safe\s+to\s+(?:run|execute|perform)\b[^\n]{0,100}\b(?:git\s+)?(?:merge|push)\b|^\s*what\s+is\s+["'\x60]?(?:git\s+)?(?:merge|push)\b|^\s*(?:should|can|could|would)\s+i\s+(?:run|execute|perform)\b[^\n]{0,100}\b(?:git\s+)?(?:merge|push)\b|^\s*what\s+happens\s+if\s+i\s+(?:run|execute|perform)\b[^\n]{0,100}\b(?:git\s+)?(?:merge|push)\b|как\s+(?:нам\s+|мне\s+)?(?:создать|открыть|отправить|смержить|слить|запушить)|нужно\s+ли\s+(?:создать|открыть|отправить|смержить|слить|запушить)|^\s*можно\s+ли\s+(?:выполнить|запустить|исполнить)(?=\s|[.,;:!?]|$)[^\n]{0,100}(?:git\s+)?(?:merge|push)\b|^\s*что\s+(?:произойдет|будет),?\s+если\s+(?:выполнить|запустить|исполнить)(?=\s|[.,;:!?]|$)[^\n]{0,100}(?:git\s+)?(?:merge|push)\b/u;
  const externalCommandMention = /\b(?:git\s+)?push\b|\bgit\s+merge\b|\bmerge\s+(?:pr|pull\s+request|#\d+)\b|(?:см[её]рдж|смердж|смерж)(?:и|ите|ить)|(?:запуш|пуш)\S*/u.test(text);
  const externalSecondPersonActionQuestion = /\b(?:can|could|would|will)\s+you\s+(?:(?:create|open|submit|prepare)\s+(?:a\s+)?(?:pull\s+request|pr)\b|(?:merge|push)\b)|(?:^|[^\p{L}\p{N}_])(?:можешь|можете)\s+(?:создать|открыть|отправить|подготовить|оформить|смержить|слить|запушить|пушить)(?=\s|[.,;:!?]|$)/u.test(text);
  const externalDecisionQuestion = /\bshould\s+(?:i|we)\s+(?:create|open|submit|merge|push)\b|стоит\s+ли\s+(?:создать|открыть|отправить|смержить|слить|запушить)/u.test(text);
  const externalReadOnlyQuestion = /\?\s*$/u.test(text) && externalCommandMention && !externalSecondPersonActionQuestion && !externalDecisionQuestion && (/^\s*(?:what|why|how|is|are|does|do)\b/u.test(text) || /^\s*(?:should|can|could|would)\s+(?:i|we)\b/u.test(text) || /^\s*(?:что|как|почему|насколько|можно\s+ли|нужно\s+ли|стоит\s+ли)(?=\s|[.,;:!?]|$)/u.test(text) || /^\s*(?:можешь|можете)\s+(?:сказать|объяснить|рассказать)(?=\s|[.,;:!?]|$)/u.test(text));
  const externalActionNegationPattern = /\b(?:please\s*,?\s+)?(?:do\s+not|don't|never)\s+(?:(?:create|open|submit|prepare)\s+(?:a\s+)?(?:pull\s+request|pr)\b|(?:git\s+)?(?:merge|push)\b)|не\s+(?:(?:create|merge|push)\b|(?:создавай|открывай|отправляй|подготавливай|оформляй)\s+(?:pull\s+request|pr)(?=\s|[.,;:!?]|$)|(?:мердж|мерж|смерж|слив|влив|запуш|пуш)\S*(?=\s|[.,;:!?]|$)|отправляй\s+(?:ветк|branch)|(?:делай|выполняй)\s+git\s+push\b)/u;
  const externalExecutionNegationPattern = /\b(?:do\s+not|don't|never)\s+(?:execute|run|perform)\b|\bwithout\s+(?:executing|running|performing)\b|не\s+(?:выполняй|запускай|исполняй)(?=\s|[.,;:!?]|$)|не\s+(?:выполняя|запуская|исполняя)(?=\s|[.,;:!?]|$)/u;
  const externalReadOnlyDirectivePattern = /^(?:(?:after|before|if|when|once)\b[^,;]{0,100},\s*)?(?:(?:please|briefly|shortly)\s*,?\s*|(?:can|could|would|will)\s+you\s+)*(?:audit|review|inspect|check|quote|output|print|show|analy[sz]e|explain|describe|tell|report|summari[sz]e)\b|^(?:(?:после|до|если|когда)\b[^,;]{0,100},\s*)?(?:(?:пожалуйста|кратко)\s*,?\s*|(?:можешь|можете)\s+)*(?:аудит|проверь|покажи|выведи|напечатай|процитируй|проанализируй|объясни|расскажи|опиши|сообщи|суммируй)(?=\s|[.,;:!?]|$)/u;
  const externalPlanStatement = externalPlanStatementPattern.test(text);
  const externalProceduralQuestion = externalProceduralQuestionPattern.test(text) || externalReadOnlyQuestion;
  const externalActionNegation = externalActionNegationPattern.test(text) || externalExecutionNegationPattern.test(text);
  const externalActionPlan = externalPlanStatement || externalProceduralQuestion || externalDecisionQuestion;
  const confirmedExternalStatement = classifyConfirmedExternalStatement(text);
  const externalAuthorityText = confirmedExternalStatement.text;
  const externalAuthorityReadOnlyStatement = confirmedExternalStatement.kind === 'read-only';
  const externalAuthorityActionList = confirmedExternalStatement.kind === 'action-list';
  const externalVerb = /\b(?:create|open|submit|prepare)\s+(?:a\s+)?(?:pull\s+request|pr)\b|\b(?:merge|push)\b|(?:создай|открой|отправь|подготовь|оформи)\s+(?:pull\s+request|pr)(?=\s|[.,;:!?]|$)|(?:см[её]рдж|смердж|смерж)(?:и|ите|ить)|(?:влей|слей)(?:те)?|(?:запуш|отправ)\S*\s+(?:ветк|branch)/u;
  const externalActionContext = text.replace(/^\s*(?:(?:without\s+(?:executing|running|performing))|(?:не\s+(?:выполняя|запуская|исполняя)))(?=\s|[.,;:!?]|$)[^,]{0,160},\s*/u, '');
  const externalClauses = externalActionContext.split(/(?:[.;]\s*|,?\s+(?:(?:and\s+)?then|and|but|(?:и\s+)?(?:затем|потом|далее)|(?:и\s+)?после\s+(?:этого|чего)|и|а|но)(?:,\s*|\s+))/u);
  const externalActionText = externalProceduralQuestion || externalDecisionQuestion || externalAuthorityReadOnlyStatement
    ? ''
    : externalClauses
      .map((clause) => clause.trim())
      .filter((clause) => clause && externalVerb.test(clause) && !externalPlanStatementPattern.test(clause) && !externalActionNegationPattern.test(clause) && !externalExecutionNegationPattern.test(clause) && !externalReadOnlyDirectivePattern.test(clause))
      .join('. ');
  const confirmedCreatePrAction = externalAuthorityActionList && /\b(?:create|open|submit|prepare|creating)\s+(?:a\s+)?(?:pull\s+request|pr)\b|\bcreation\s+of\s+(?:a\s+)?(?:pull\s+request|pr)\b|создани\S*\s+(?:pull\s+request|pr)(?=\s|[.,;:!?]|$)/u.test(externalAuthorityText);
  const confirmedMergeAction = externalAuthorityActionList && /\bmerge\b[^\n,;]{0,80}\b(?:pr|pull\s+request)\b[^\n,;]{0,80}(?:\b(?:into|to)\s+|(?:в|на)\s+)(?:protected\s+)?(?:main|master)\b|(?:см[её]рдж|смердж|смерж)(?:и|ите|ить)[^\n,;]{0,80}(?:\b(?:pr|main|master|origin\/)\b|ветк)/u.test(externalAuthorityText);
  const confirmedPushAction = externalAuthorityActionList && /\bpush\b[^\n,;]{0,80}(?:\b(?:branch(?:es)?|commits?|changes?|tags?|refs?|origin\/[a-z0-9._/-]+|origin\s+[a-z0-9._/-]+|remote\b)|ветк)|(?:запуш|пуш|отправ)\S*\s+(?:ветк|branch)/u.test(externalAuthorityText);
  const createPrAction = confirmedCreatePrAction || /\b(?:create|open|submit|prepare)\s+(?:a\s+)?(?:pull\s+request|pr)\b|(?:создай|открой|отправь|подготовь|оформи)\s+(?:pull\s+request|pr)(?=\s|[.,;:!?]|$)/u.test(externalActionText);
  const mergeAction = confirmedMergeAction || /(?:^|[.!?]\s*|\b(?:first|please|then|and|instead)\s*,?\s+|\b(?:can|could|would|will)\s+you\s+|\b(?:if|when|after|once|unless)\b[^\n,;]{0,100},?\s+)merge(?=\s+(?:(?:the\s+)?(?:pr|pull\s+request|this|it|#\d+)\b|(?:the|this|a)\s+(?:local\s+)?branch\b)|[^\n]{0,80}\b(?:into|to)\s+(?:(?:protected\s+)?(?:main|master)(?=\s*[.,;:!?]?$)|shared\s+branch|origin\/[a-z0-9._/-]+)|[.!?]?\s*$)|(?:см[её]рдж|смердж|смерж)(?:и|ите|ить)/u.test(externalActionText) || /(?:влей|слей)(?:те)?[^\n]{0,80}(?:\b(?:pr|main|master|branch|origin\/)\b|ветк)/u.test(externalActionText);
  const colloquialRemotePush = /(?:запуш|пуш|залей)\S*[^\n]{0,48}(?:гитхаб|github|реп[уаые]|origin)|(?:закоммить|закоммич)\S*[^\n]{0,24}(?:запуш|пуш)/u.test(text);
  const pushAction = confirmedPushAction || colloquialRemotePush || /(?:^|[.!?]\s*|\b(?:first|please|then|and|instead)\s*,?\s+|\b(?:can|could|would|will)\s+you\s+|\b(?:if|when|after|once|unless)\b[^\n,;]{0,100},?\s+)push\b(?=[^\n]{0,80}\b(?:branch(?:es)?|commits?|changes?|tags?|refs?|origin\/[a-z0-9._/-]+|origin\s+[a-z0-9._/-]+|remote\b|to\s+(?:main|master|protected|shared\s+branch|remote\s+branch)))|\bgit\s+push\b|(?:запуш|пуш|отправ)\S*\s+(?:ветк|branch)/u.test(externalActionText);
  const externalActionRequested = createPrAction || mergeAction || pushAction;
  const conditionalExternalAction = /^(?:if|when|after|once|unless)\b[^\n,;]{0,100},?\s+(?:merge|push)\b/u.test(externalActionText);
  const protectedBranchTarget = /\bprotected\s+(?:main|master|branch)\b|(?:защищенн|защищен)\S*\s+(?:main|master|ветк)/u.test(text);
  const localRepoTarget = mergeAction && /\b(?:locally|local\s+(?:main|master|repository)|working\s+tree)\b|локальн\S*\s+(?:репозитор|main|master)|репозитор\S*\s+локальн/u.test(text);
  const sharedBranchTarget = protectedBranchTarget || /\b(?:main|master|shared\s+branch|remote\s+branch|origin\/[a-z0-9._/-]+)\b|(?:общ|совместн|удаленн)\S*\s+ветк|(?:в|на)\s+(?:main|master)(?=\s|[.,;:!?]|$)/u.test(text);
  const unresolvedExternalTarget = (mergeAction || pushAction) && !sharedBranchTarget && !localRepoTarget;
  const explicitActionAuthority = externalActionRequested && !unresolvedExternalTarget && (/\b(?:i\s+am|i'm)\s+(?:(?:an?|the)\s+)?(?:owner|maintainer)\b[^\n]{0,100}\b(?:approve|authorize|confirm|allow)\b|\b(?:owner|maintainer)\b[^\n]{0,100}\b(?:approved|authorized|confirmed)\b|я\s+(?:владелец|мейнтейнер)[^\n]{0,100}(?:разрешаю|подтверждаю|одобряю)/u.test(text));
  const protectedBranchMutation = protectedBranchTarget && (mergeAction || pushAction);
  const sharedBranchMutation = !protectedBranchTarget && !localRepoTarget && sharedBranchTarget && (mergeAction || pushAction);
  if (createPrAction) mark(true, 'action:create-pr');
  if (mergeAction) mark(true, 'action:merge');
  if (pushAction) mark(true, 'action:push');
  if (explicitActionAuthority) mark(true, 'authority:explicit-action-target');
  if (protectedBranchTarget && externalActionRequested) mark(true, 'target:protected-branch'); else if (localRepoTarget) mark(true, 'target:local-repository'); else if (sharedBranchTarget && externalActionRequested) mark(true, 'target:shared-branch');
  if (unresolvedExternalTarget) mark(true, 'target:unresolved');
  if (protectedBranchMutation) mark(true, 'effect:protected-branch-mutation');
  else if (sharedBranchMutation) mark(true, 'effect:shared-branch-mutation');
  else if (localRepoTarget) mark(true, 'effect:local-mutation');
  else if (externalActionRequested) mark(true, 'effect:remote-collaboration');
  const effectScanText = (boundedTranslation || metaEvaluation) ? analysisText : text;
  const productionContext = /\b(?:prod|production)\b|\blive\b[^\n]{0,60}\b(?:database|data|records?|credentials?|keys?)\b|\b(?:deploy|publish|release|roll\s*out|ship|migrate|wipe|delete|rotate|revoke)\b[^\n]{0,80}\blive\b|\blive\b[^\n]{0,80}\b(?:deploy|publish|release|roll\s*out|ship|migration|wipe|delete|rotation|revocation)\b|(?<![\p{L}\p{N}_])прод(?:а|е|у|ом)?(?![\p{L}\p{N}_])|продакшен|продакшн|боев\S*(?:\s+\S+){0,3}\s+(?:баз|данн|ключ|учетн)|(?:выкат|разверн|задепло|опублик|релиз|мигрир|удал|сотр|ротац|отоз)\S*[^\n]{0,80}(?:лайв|боев\S*)/u.test(effectScanText);
  const credentialContext = /\b(?:credentials?|api[- ]?keys?|access[- ]?keys?)\b|учетн\S*\s+данн|ключ\S*\s+доступ/u.test(effectScanText);
  const destructiveDataEffect = /\b(?:wipe|purge|erase|destroy)\b[^\n]{0,80}\b(?:data|database|records?|credentials?|keys?)\b|(?:сотр|очист|уничтож)\S*[^\n]{0,80}(?:данн|баз|запис|ключ|учетн)/u.test(effectScanText);
  const credentialEffect = credentialContext && /\b(?:rotate|revoke|reset|replace|delete|remove|change)\b|ротац|отоз|отмен|смен|замен|удал/u.test(effectScanText);
  const highRisk = mark(/\b(auth(?:entication|orization)?|password|payment|migration|delete|deletion|permission|races?|race\s+conditions?|concurrency|security|secret|production)\b|аутентификац|авторизац|парол|оплат|платеж|миграц|удален|прав.*доступ|гонк|конкурент|безопасност|секрет|продакшен|продакшн/u.test(effectScanText) || productionContext || destructiveDataEffect || credentialEffect || protectedBranchMutation || sharedBranchMutation || unresolvedExternalTarget, 'risk:high');
  const multiSystem = /\b(payment|integration|multi-system|distributed|webhook)\b|платеж|интеграц|нескольк.*систем|вебхук/u.test(text);
  const architectural = mark(/\b(architecture|architectural|public\s+(?:api|interface)|breaking\s+change|system\s+shape|system\s+boundar(?:y|ies)|service\s+boundar(?:y|ies)|data\s+schema)\b|архитектур|публичн\S*\s+(?:api|интерфейс)|границ\S*\s+(?:сервис|систем)|схем\S*\s+обмен|перепроектир/u.test(text), 'clarity:architectural');
  const crossCutting = multiSystem || architectural || /\b(api|database|schema|shared state|canonical (?:state|mutation|change)|process group|workspace-wide|lifecycle|migration)\b|all\s+canonical\s+(?:state\s+)?(?:mutations?|changes?)|нескольк.*модул|общ.*состояни|каноническ.*(?:состояни|изменени)|жизненн.*цикл|групп.*процесс|баз\S*\s+данн|миграц|мигрир/u.test(text);
  if (multiSystem) mark(true, 'span:multi-system'); else if (crossCutting) mark(true, 'span:cross-cutting');
  const uncertain = !externalProceduralQuestion && /\b(feasibility|research|can we|should we|unknown|explore|compare (?:the )?(?:options|approaches))\b|возможност|возможно ли|исследу|можем ли|неизвест|стоит ли|погугл|сравни.*(?:вариант|подход)/u.test(text);
  const trivial = mark(/^\s*(?:hi|hello|hey|thanks|thank you|привет|здравствуй(?:те)?|спасибо)[!.,?\s]*$/u.test(text), 'intent:trivial');
  const noChangePattern = /\b(?:(?:do not|don't)\s+(?:(?:create|change|modify|edit|alter|touch)(?:\s+or\s+)?){1,2}\s+(?:any\s+)?(?:files?|code)|without\s+(?:(?:creating|changing|modifying|editing|altering|touching)(?:\s+or\s+)?){1,2}\s+(?:any\s+)?(?:files?|code)|(?:do not|don't|without)\s+(?:make\s+)?(?:any\s+)?(?:change|changes|modify|modification|edit|editing|alter|touch)|do not save (?:any )?edits|(?:report|inspect|review)\s+only|only\s+report|read[- ]only|without\s+changes?)\b|ничего\s+не\s+(?:меняй|изменяй|исправляй|трогай)|(?:пока\s+)?не\s+(?:меняй|изменяй|вноси|трогай|правь|редактируй)(?=\s|[.,;:!?]|$)|(?:в\s+)?код\S*\s+(?:пока\s+)?не\s+(?:лезь|правь|меняй|трогай)|не\s+меняя|не\s+внося\s+изменени\S*(?:\s+в\s+(?:файл\S*|код\S*))?|не\s+(?:создавая|изменяя|редактируя|удаляя|трогая)(?:\s*,?\s*(?:и|или)\s+не\s+(?:создавая|изменяя|редактируя|удаляя|трогая)){0,3}\s+(?:файл\S*|код\S*)|без\s+(?:изменени|правок)|правк\S*\s+не\s+(?:вноси|сохраняй)|не\s+сохраняй\s+(?:никаких\s+)?(?:правок|изменен)|оставь\s+код\s+как\s+есть|только\s+(?:сообщи|покажи|дай).*результат|только\s+(?:проверь|посмотри)/u;
  const noChange = mark(noChangePattern.test(text) || (externalActionNegation && !externalActionRequested), 'authority:no-change');
  const affirmativeText = text
    .replace(new RegExp(noChangePattern.source, 'gu'), '')
    .replace(/\bafter\s+(?:the\s+)?(?:update|change|migration)\b/gu, '')
    .trim();
  const actionText = affirmativeText.replace(/\b(?:software-change|software change|investigation|audit|operational|simple|spike)\b/gu, '');
  const directiveText = actionText
    .replace(/\bhow\s+to\s+(?:fix|change|modify|edit|implement|add|update|remove|delete|rewrite|refactor|improve|redesign|migrate|deploy)\b/gu, '')
    .replace(/как\s+(?:исправить|изменить|реализовать|добавить|обновить|удалить|переписать|улучшить|переработать|мигрировать|развернуть)/gu, '');
  const changePattern = /\b(fix|change|modify|edit|implement|add|update|remove|delete|rewrite|refactor|harden|improve|optimi[sz]e|redesign|migrate|deploy|publish|ship|roll\s*out|wipe|purge|erase|destroy|rotate|revoke|reset|replace|locali[sz]e)\b|сделай\s+так,?\s+чтобы|исправ|измен|внес|правк|реализ(?:уй|овать|ируй|ировать)|добав|обнов(?:и|ить|ляй|ите)|удал|перепиш|рефактор|улучш|оптимиз|переработ|перепроектир|мигрир|мигриру|выкат|разверн|задепло|опублик|зарелиз|пофикс|почин|сотр|очист|уничтож|ротац|ротир|отоз|смен|замен|локализ|усил.*(?:защит|безопас)/u;
  const readOnlyDirectivePattern = /^(?:(?:please|briefly|shortly|first)\s*,?\s*){0,3}(?:explain|describe|report|tell|summari[sz]e)\b|^(?:(?:пожалуйста|кратко|сначала)\s*,?\s*){0,3}(?:объясни|расскажи|опиши|сообщи|суммируй|дай\s+отч[её]т)(?=\s|[.,;:!?]|$)/u;
  const reportingDirectiveText = directiveText
    .replace(/\b(?:make|prepare|provide)\s+(?:an?\s+)?(?:analysis|assessment|review|report)\b/gu, '')
    .replace(/(?:^|[.!?]\s*)(?:сделай|проведи)\s+(?:анализ|обзор|оценку|отчет)(?=\s|[.,;:!?]|$)/gu, ' ');
  const changeMention = changePattern.test(reportingDirectiveText);
  const inspectParaphrase = mark(/\b(?:walk(?:\s+(?:through|the|this|current))|look\s+over|tell me what(?:'s| is) off|write (?:up )?(?:findings|what you saw)|leave (?:every |the )?(?:file|source)s? (?:as-is|untouched)|do not save (?:any )?edits)\b|(?:обойди|пройди(?:сь)?)\s+(?:по\s+)?(?:дерев|репозитор|проект)|(?:скажи|напиши),?\s+что\s+(?:не так|увидел)|не\s+сохраняй\s+(?:никаких\s+)?(?:правок|изменен)|правки\s+не\s+сохраняй/u.test(text), 'intent:inspect-paraphrase');
  const diagnoseParaphrase = mark(/\b(?:isolate (?:the )?(?:origin|cause)|figure out (?:the )?origin|trace (?:it )?to (?:the )?(?:real )?source|before any patch|blank dashboard)\b|пустой\s+экран|источник\s+этого\s+симптома|до\s+любого\s+патча/u.test(text), 'intent:diagnose-paraphrase');
  const mutateParaphrase = mark(/\b(?:should (?:show|display|list)|needs .{0,80} visible|users should see|first screen|storefront)\b|(?:должн\S*\s+(?:показывать|отображать|видеть)|на\s+первом\s+экране|видна?\s+цена|на\s+витрине)/u.test(text) && !inspectParaphrase && !diagnoseParaphrase && !noChange, 'intent:mutate-paraphrase');
  const planningRequest = planningEarly || externalActionPlan || (externalActionNegation && !externalActionRequested) || /\b(?:plan\s+(?:how|for|to)|(?:what(?:'s| is)|propose|draft|prepare|recommend|review|critique)\s+(?:the\s+)?(?:next\s+)?(?:plan|roadmap|proposal|recommendations?))\b|(?:какой|предлож\S*|состав\S*|подготов\S*|дай|продум\S*|оцени\S*|покритику\S*|нужен)\s+(?:\S+\s+){0,3}план\S*|план\S*\s+(?:по|для|улучш|дальнейш)|критик\S*\s+(?:существ|текущ)/u.test(text);
  const executionConnector = /(?:,?\s+)(?:(?:and\s+)?then|and|(?:и\s+)?(?:затем|потом|далее)|(?:и\s+)?после\s+(?:этого|чего)|и)(?:,\s*|\s+)/u.exec(directiveText);
  const executionSuffix = executionConnector ? directiveText.slice(executionConnector.index + executionConnector[0].length) : '';
  const planningAndExecution = Boolean(planningRequest && executionConnector && !readOnlyDirectivePattern.test(executionSuffix) && changePattern.test(executionSuffix));
  const inspectAct = mark(comparisonRequest || inspectParaphrase || /\b(?:find (?:the )?(?:inconsistenc\w*|contradictions?|mismatches?))\b|найди(?:те)?\s+(?:возможн\S*\s+)?(?:не\s*)?состык|найди(?:те)?\s+противореч|покритику/u.test(text), 'intent:inspect');
  const readOnlySpeech = (inspectAct || thinkAct) && !implementDirective && !colloquialMutate && !evalHarness && !planningAndExecution;
  const explainAndDo = /^(?:explain|describe|объясни|расскажи)\s+(?:and|и)\s+/u.test(directiveText);
  const leadingReadOnly = readOnlyDirectivePattern.test(directiveText) && !planningAndExecution && !explainAndDo;
  const changeAsTopic = /улучшить|улучшени\S*|\bimprov(?:e|ing|ement)s?\b/u.test(text);
  const valueQuestion = mark(
    !implementDirective && !colloquialMutate && !evalHarness && !productDesire && changeAsTopic && (
      /\?\s*$/u.test(text)
      || /(?:^|[.!?]\s*)(?:како[ейяю]|какие|каков|что)\s+(?:\S+\s+){0,6}улучш/u.test(text)
      || /(?:^|[.!?]\s*)(?:what|which|how much)\s+(?:\S+\s+){0,6}\bimprov/u.test(text)
    ),
    'intent:value-question',
  );
  const opinionBlocksChange = (opinionRequest || valueQuestion) && !implementDirective && (/\?\s*$/u.test(text) || changeAsTopic);
  const requestedChange = implementDirective || colloquialMutate || productDesire || evalHarness || (!metaEvaluation && !leadingReadOnly && !opinionBlocksChange && !readOnlySpeech && !valueQuestion && (((changeMention && (!planningRequest || planningAndExecution)) || mutateParaphrase) && !inspectParaphrase && !diagnoseParaphrase));
  const softwareImpact = /\b(add|render|use|build|component|page|ui|catalog|asset|assets|code|implement|api|database|schema|client|function|method|class|module|array|arrays|queue|telemetry|stream|streams|coverage)\b|добав|рендер|использ.*(?:изображ|asset|ресурс)|страниц|компонент|интерфейс|каталог|код|баз\S*\s+данн|схем|функци|массив|очеред|телеметр|поток/u.test(effectScanText) || (translationIntentEarly && productLocalizationEarly);
  const translationIntent = translationIntentEarly;
  const boundedText = boundedTextEarly;
  const productLocalization = productLocalizationEarly;
  const translation = translationIntent && boundedText && !productLocalization;
  const stableFact = mark((/^(?:what\s+is\s+the\s+capital\s+of\s+[\p{L} .'-]+|(?:the\s+)?capital\s+of\s+[\p{L} .'-]+|столиц[аы]\s+[\p{L} .'-]+)\?$/u.test(text.trim()) || /^что\s+такое\s+[\p{L}0-9 .'_-]+(?:\s+одним\s+предложением)?\??$/u.test(text.trim())) && !highRisk && !softwareImpact && !requestedChange, 'intent:stable-fact');
  const boundedRewrite = /\b(?:rewrite|shorten|rephrase)\b[^\n]{0,80}\b(?:this|the)?\s*(?:sentence|phrase|paragraph|text)\b|(?:перепиш|сократ|перефразир)\S*[^\n]{0,80}(?:предложен|фраз|абзац|текст)/u.test(text) && !productLocalization && !softwareImpact;
  const boundedFormat = /\bformat\b[^\n]{0,80}\b(?:this|the)?\s*(?:short\s+)?(?:list|text|paragraph)\b|отформатир\S*[^\n]{0,80}(?:коротк\S*\s+)?(?:список|текст|абзац)/u.test(text) && !softwareImpact;
  if (translation || boundedRewrite) mark(true, 'intent:bounded-text'); if (boundedFormat) mark(true, 'intent:bounded-format');
  const hostInstall = !/\?\s*$/u.test(text) && /(?<![\p{L}\p{N}_])(?:поставь|установи|заинсталь)(?=\s|[.,;:!?]|$)[^\n]{0,48}(?:pinmind|плагин|скилл?)/u.test(text);
  const operationalIntent = externalActionRequested || typoOnly || hostInstall || (/\b(copy|rename|move|sort files?)\b|скопир|переимен|перемест|отсортир.*файл/u.test(text) && !softwareImpact);
  const operational = operationalIntent && !noChange && (!externalActionRequested || !requestedChange);
  const sideEffectVerb = /\b(?:deploy|publish|release|roll\s*out|ship|migrate|migrations?|wipe|purge|erase|destroy|delete|rotate|revoke|reset)\b|задепло|выкат|разверн|опублик|мигрир|сотр|уничтож|удал|ротац|отоз|ротир/u.test(effectScanText);
  const imperativeEffect = productionContext && sideEffectVerb && !/\?\s*$/u.test(text) && !leadingReadOnly && !metaEvaluation && !boundedTranslation;
  mark(!boundedTranslation && !metaEvaluation && (requestedChange || operationalIntent || imperativeEffect) && (productionContext || destructiveDataEffect || credentialEffect) && sideEffectVerb, 'effect:external-side-effect');
  const diagnosisScan = metaEvaluation ? analysisText : text;
  const symptom = /\b(?:errors?|fail(?:s|ed|ure|ing)?|returns?\s+[45]\d{2}|crash(?:es|ed|ing)?|broken|not\s+work(?:ing)?)\b|ошиб|падает|сломал|не\s+работает|отвалив|криво\s+роутит|не\s+понимает/u.test(diagnosisScan);
  const exploratoryQuestion = /\b(?:feasibility|compare (?:the )?(?:options|approaches)|explore (?:the )?(?:options|approaches))\b|оцен.*возможност|сравни.*(?:вариант|подход)/u.test(diagnosisScan);
  const investigation = diagnoseParaphrase || (!requestedChange && !externalActionRequested && !conditionalExternalAction && ((!exploratoryQuestion && /\b(debug|diagnos\S*|investigat(?:e|es|ed|ing|ion)|root cause|reproduce|bug|find (?:the )?cause|find why)\b|диагност|расследован|исследу.*ошиб|найд.*причин|воспроизвед|баг|разберис/u.test(diagnosisScan)) || (/\bwhy\b|почему|пачему/u.test(diagnosisScan) && symptom) || symptom));
  const explanation = externalAuthorityReadOnlyStatement || /\b(?:explain|describe)\b|\bhow\s+(?:does|do|is|are)\b|объясн|расскаж|опиш\S*\s+как/u.test(text);
  const auditRequest = /\b(audit|analysis|analy[sz]e|assessment|review|reviewing|pr review|security review|inspect|evaluate|check|report|look for (?:problems|issues)|find (?:problems|issues))\b|^\s*(?:quote|output|print|show)\b|аудит|анализ|ревью|провер|^\s*(?:покажи|выведи|напечатай|процитируй)(?=\s|[.,;:!?]|$)|посмотр|оцени|проанализир|глян|отчет|сообщи|поиск(?:ать|и).*проблем|найд\S*.*проблем/u.test(text);
  const spike = !externalProceduralQuestion && /\b(feasibility|research|can we|should we|spike|explore|compare (?:the )?(?:options|approaches))\b|оцен.*возможност|исследу|можем ли|спайк|стоит ли|погугл|сравни.*(?:вариант|подход)/u.test(text);
  const recognizedReadOnlyIntent = investigation || explanation || auditRequest || planningRequest || spike || trivial || stableFact || translation || boundedRewrite || boundedFormat || inspectParaphrase || diagnoseParaphrase;
  const conflict = mark(noChange && (requestedChange || operationalIntent || externalActionRequested || !recognizedReadOnlyIntent), 'authority:conflict');
  const vague = mark(/^(?:(?:make|fix|improve)\s+(?:it|this)(?:\s+(?:work|better|properly))?|do\s+(?:it|this)\s+(?:right|properly)|(?:сделай|почини|исправь|улучши)(?:\s+(?:это|нормально|как\s+надо))?)[!.,?\s]*$/u.test(text.trim()), 'ambiguity:vague');
  const audit = conflict || inspectParaphrase || metaEvaluation || readOnlySpeech || valueQuestion || (opinionRequest && !requestedChange) || (!investigation && ((!requestedChange && (explanation || planningRequest || comparisonRequest || documentationQuestion || routePolicyQuestion || opinionRequest)) || (auditRequest && (!requestedChange || noChange))));
  if (requestedChange && !translation) mark(true, 'intent:change'); if (softwareImpact && !translation) mark(true, 'impact:software');
  if (operationalIntent) mark(true, 'intent:operational'); if (investigation) mark(true, 'intent:investigation'); if (spike) mark(true, 'intent:spike'); if (audit) mark(true, 'intent:audit');
  let selectedExplicit;
  if (explicitRoute === 'audit' || explicitRoute === 'investigation' || explicitRoute === 'software-change') selectedExplicit = explicitRoute;
  else if (explicitRoute === 'simple' && (trivial || stableFact || translation || boundedRewrite || boundedFormat || (!requestedChange && !operationalIntent && !softwareImpact && !highRisk && !architectural))) selectedExplicit = explicitRoute;
  else if (explicitRoute === 'operational' && operationalIntent && !noChange && !requestedChange && !highRisk && !architectural) selectedExplicit = explicitRoute;
  else if (explicitRoute === 'spike' && spike && !requestedChange && !softwareImpact && !highRisk && !architectural) selectedExplicit = explicitRoute;
  const recognizedOutcome = trivial || stableFact || translation || boundedRewrite || boundedFormat || operational || investigation || spike || audit || requestedChange || softwareImpact || externalActionRequested || inspectParaphrase || diagnoseParaphrase || mutateParaphrase || highRisk || comparisonRequest || nextStepQuestion || documentationQuestion || routePolicyQuestion || typoOnly || opinionRequest || valueQuestion || colloquialMutate || productDesire || evalHarness || hostInstall;
  const unrecognized = mark(!recognizedOutcome && Boolean(text.trim()), 'intent:unrecognized');
  const inferredRoute = trivial || stableFact || translation || boundedRewrite || boundedFormat ? 'simple' : operational ? 'operational' : investigation ? 'investigation' : spike ? 'spike' : audit ? 'audit' : ((requestedChange || softwareImpact || highRisk) && !vague ? 'software-change' : 'audit');
  const route = selectedExplicit ?? inferredRoute;
  const risk = highRisk ? 'high' : (externalActionRequested && !localRepoTarget ? 'medium' : (route === 'operational' || route === 'simple' || route === 'spike' ? 'low' : 'medium'));
  const executionSpan = multiSystem ? 'multi-system' : crossCutting ? 'cross-cutting' : 'local';
  const clarity = input.clarity === 'architectural' || architectural ? 'architectural' : (input.clarity === 'uncertain' || uncertain || route === 'spike' || conflict || vague || unresolvedExternalTarget || unrecognized ? 'uncertain' : 'clear');
  if (signalSet.size === 0) signalSet.add(text.trim() ? 'intent:unrecognized' : 'intent:empty');
  const blockedExplicit = Boolean(explicitRoute && selectedExplicit !== explicitRoute);
  const confidence = conflict || vague || unresolvedExternalTarget || !text.trim() || unrecognized ? 'low' : (blockedExplicit || signalSet.has('intent:default-change') ? 'medium' : 'high');
  const needsHumanConfirmation = conflict || vague || unresolvedExternalTarget || !text.trim() || unrecognized;
  const reasons = {
    simple: translation ? 'A bounded translation request needs no tools or persistent workflow.' : (boundedRewrite || boundedFormat ? 'A bounded text request needs no tools or persistent workflow.' : (stableFact ? 'A single stable fact stays lightweight.' : 'An obvious trivial or explicit simple request stays lightweight.')),
    operational: 'A bounded operational action does not change software behavior.',
    spike: 'The requested output is knowledge, not a committed product change.',
    audit: (vague || unrecognized) ? 'Unclear or unrecognized intent stays read-only until confirmed.' : 'The request evaluates existing work without authorizing a product change.',
    investigation: 'The request needs a failing feedback loop and root-cause evidence first.',
    'software-change': highRisk ? 'A software change affects a high-risk behavior.' : 'A software behavior change requires a contract and evidence.',
  };
  return { route, clarity, executionSpan, risk, reason: reasons[route], signals: [...signalSet], confidence, needsHumanConfirmation };
}
