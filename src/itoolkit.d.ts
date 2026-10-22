declare module 'itoolkit' {
  interface Data {
    name?: string;
    type: string;
    value?: string;
    io?: 'in' | 'out' | 'both';
    by?: 'ref';
    trim?: 'off';
    varying?: '2' | '4';
    dim?: string;
    fields?: Data[];
  }
  export class ProgramCall {
    constructor(name: string, options: { lib: string; func?: string; error?: 'on' });
    addParam(data: Data): void;
    addReturn(data: Data): void;
    toXML(): string;
  }
}
