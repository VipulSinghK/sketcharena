// Word list for the game
const words = [
    'apple', 'banana', 'car', 'dog', 'elephant', 'flower', 'guitar', 'house', 
    'igloo', 'jacket', 'kite', 'lion', 'mountain', 'notebook', 'ocean', 'pizza', 
    'queen', 'rainbow', 'sun', 'tree', 'umbrella', 'volcano', 'whale', 'xylophone', 
    'yacht', 'zebra', 'airplane', 'beach', 'castle', 'dragon', 'eagle', 'forest', 
    'giraffe', 'hamburger', 'island', 'jellyfish', 'koala', 'lamp', 'moon', 
    'ninja', 'octopus', 'penguin', 'robot', 'snowman', 'tiger', 'unicorn', 
    'vampire', 'wizard', 'yeti', 'zombie', 'anchor', 'butterfly', 'cactus', 
    'dinosaur', 'earth', 'fairy', 'glasses', 'helicopter', 'ice cream', 'kangaroo', 
    'lighthouse', 'mermaid', 'nest', 'owl', 'pirate', 'queen bee', 'rocket', 
    'starfish', 'train', 'umbrella', 'violin', 'watermelon', 'x-ray', 'yogurt', 
    'zipper', 'ant', 'bear', 'cat', 'duck', 'elephant', 'fish', 'goat', 'horse', 
    'insect', 'jaguar', 'key', 'lobster', 'monkey', 'nurse', 'ostrich', 'peacock',
    'desk', 'chair', 'sofa', 'television', 'computer', 'book', 'pencil', 'door',
    'window', 'clock', 'shoe', 'hat', 'shirt', 'pants', 'skirt', 'socks',
    'gloves', 'scarf', 'necklace', 'ring', 'watch', 'bracelet', 'sunglasses',
    'backpack', 'wallet', 'purse', 'camera', 'headphones', 'microphone', 'speaker',
    'keyboard', 'mouse', 'monitor', 'printer', 'phone', 'tablet', 'scissors',
    'stapler', 'paperclip', 'ruler', 'calculator', 'calendar', 'notebook', 'pen'
];

// Generate a random room ID (4 uppercase letters)
function generateRoomId() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return result;
}

// Generate a random word
function generateRandomWord() {
    const word = words[Math.floor(Math.random() * words.length)];
    console.log("Generated Word:", word);  // Debug log
    return word;
}


// Create a hint for the word (replace letters with underscores)
function createWordHint(word) {
    return word.replace(/[a-zA-Z]/g, '_ ').trim();
}

module.exports = {
    generateRoomId,
    generateRandomWord,
    createWordHint
};