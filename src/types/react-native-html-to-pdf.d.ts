declare module 'react-native-html-to-pdf' {
  export interface Options {
    html: string;
    fileName?: string;
    directory?: string;
    base64?: boolean;
    width?: number;
    height?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    padding?: number;
    bgColor?: string;
  }

  export interface PDF {
    filePath: string;
    base64?: string;
  }

  export default class RNHTMLtoPDF {
    static convert(options: Options): Promise<PDF>;
  }
}
