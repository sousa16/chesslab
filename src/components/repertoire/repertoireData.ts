export interface Line {
  id: string;
  name: string;
  moves: string;
  learned: boolean;
}

export interface Opening {
  id: string;
  name: string;
  lines: Line[];
}

export interface RepertoireData {
  white: Opening[];
  black: Opening[];
}

export const repertoireData: RepertoireData = {
  white: [
    {
      id: "white-1",
      name: "Italian Game",
      lines: [
        {
          id: "white-1-1",
          name: "Main Line",
          moves: "1.e4 e5 2.Nf3 Nc6 3.Bc4",
          learned: true,
        },
        {
          id: "white-1-2",
          name: "Two Knights Defense",
          moves: "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6",
          learned: false,
        },
      ],
    },
    {
      id: "white-2",
      name: "Ruy Lopez",
      lines: [
        {
          id: "white-2-1",
          name: "Closed Defense",
          moves: "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6",
          learned: true,
        },
        {
          id: "white-2-2",
          name: "Open Defense",
          moves: "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.0-0 Nxe4",
          learned: false,
        },
      ],
    },
  ],
  black: [
    {
      id: "black-1",
      name: "Sicilian Defense",
      lines: [
        {
          id: "black-1-1",
          name: "Najdorf Variation",
          moves: "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6",
          learned: true,
        },
        {
          id: "black-1-2",
          name: "Classical Variation",
          moves: "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 Nc6",
          learned: false,
        },
      ],
    },
    {
      id: "black-2",
      name: "French Defense",
      lines: [
        {
          id: "black-2-1",
          name: "Winawer Variation",
          moves: "1.e4 e6 2.d4 d5 3.Nc3 Bb4",
          learned: true,
        },
        {
          id: "black-2-2",
          name: "Classical Variation",
          moves: "1.e4 e6 2.d4 d5 3.Nc3 Nf6",
          learned: false,
        },
      ],
    },
  ],
};
