export const getAsilColor = (asil: string): string => {
    if (!asil) {
      return 'rgb(200, 200, 200)'; // Light Grey for default
    }
    switch (asil.toUpperCase()) {
      case 'D':
        return 'rgb(217, 0, 27)';       // Red
      case 'C':
        return 'rgb(237, 109, 0)';      // Orange
      case 'B':
        return 'rgb(242, 204, 21)';     // Yellow
      case 'A':
        return 'rgb(132, 201, 73)';     // Light Green
      case 'QM':
        return 'rgb(68, 148, 201)';     // Blue
      case 'TBC':
        return 'rgb(128, 128, 128)';   // Grey
      case 'N/A':
        return 'rgb(200, 200, 200)';  // Light Grey
      default:
        return 'rgb(200, 200, 200)'; // Light Grey for any other case
    }
  }; 