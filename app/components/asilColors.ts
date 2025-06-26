export const getAsilColor = (asil: string): string => {
    if (!asil) {
      return 'default';
    }
    switch (asil.toUpperCase()) {
      case 'D':
        return 'red';
      case 'C':
        return 'orange';
      case 'B':
        return 'gold';
      case 'A':
        return 'green';
      case 'QM':
        return 'blue';
      case 'TBC':
        return 'purple';
      default:
        return 'default';
    }
  }; 