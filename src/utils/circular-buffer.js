/**
 * Circular Buffer implementation for efficient sliding window operations
 */
class CircularBuffer {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.buffer = new Array(maxSize);
        this.head = 0;
        this.tail = 0;
        this.length = 0;
    }

    push(element) {
        this.buffer[this.head] = element;
        this.head = (this.head + 1) % this.maxSize;
        
        if (this.length < this.maxSize) {
            this.length++;
        } else {
            this.tail = (this.tail + 1) % this.maxSize;
        }
    }

    get(index) {
        if (index >= this.length) return undefined;
        return this.buffer[(this.tail + index) % this.maxSize];
    }

    toArray() {
        const result = [];
        for (let i = 0; i < this.length; i++) {
            result.push(this.get(i));
        }
        return result;
    }
}
