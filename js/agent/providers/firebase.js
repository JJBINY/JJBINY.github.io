/**
 * Firebase provider integration point.
 *
 * Keep this file free of hard-coded keys. When Firebase AI Logic is configured:
 * 1. initialize Firebase and App Check here,
 * 2. call Gemini with `systemPrompt`, `context`, `question`, and bounded `history`,
 * 3. normalize the response to the exact shape returned below.
 *
 * The rest of the application must not know which model provider is active.
 */
export class FirebaseAgentProvider {
  constructor(options = {}) {
    this.name = "firebase";
    this.label = "GEMINI MODE";
    this.notice =
      "Firebase AI Logic를 통해 Gemini에 연결되어 있습니다. 답변은 공개 포트폴리오 컨텍스트 안에서 생성됩니다.";
    this.sectionCopy =
      "프로젝트·기술·경험·가치관을 자연어로 탐색합니다. 답변의 근거는 이 페이지에 공개된 포트폴리오 데이터로 제한됩니다.";
    this.options = options;
  }

  async generate() {
    throw new Error(
      "Firebase provider가 아직 설정되지 않았습니다. README의 Firebase/Gemini 연결 지점을 참고하세요."
    );
  }
}
