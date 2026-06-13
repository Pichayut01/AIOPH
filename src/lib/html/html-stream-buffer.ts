export class HtmlStreamBuffer {
  private bufferedHtml = "";

  push(chunk: string): string {
    this.bufferedHtml += chunk;
    return this.getRenderableHtml();
  }

  flush(): string {
    const finalHtml = this.bufferedHtml;
    this.bufferedHtml = "";
    return finalHtml;
  }

  private getRenderableHtml(): string {
    const lastOpeningBracketIndex = this.bufferedHtml.lastIndexOf("<");
    const lastClosingBracketIndex = this.bufferedHtml.lastIndexOf(">");

    if (lastOpeningBracketIndex > lastClosingBracketIndex) {
      return this.bufferedHtml.slice(0, lastOpeningBracketIndex);
    }

    return this.bufferedHtml;
  }
}
