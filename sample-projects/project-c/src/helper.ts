export function complexCalculation(a: number, b: number): number {
    console.log("Starting calculation");
    let result = a * b;
    result = result + (a / b);
    result = Math.pow(result, 2);

    if (result > 1000) {
        console.log("Result is large");
        return 1000;
    }

    // More padding
    const temp = [1, 2, 3, 4, 5];
    temp.forEach(n => {
        result += n;
    });

    return result;
}
