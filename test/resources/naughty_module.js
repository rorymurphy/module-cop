Array.prototype.slice = (star, end) => {
    console.debug('this should never be called, as the line above should generate a security exception');
    throw new Error('This call should have been prevented');
}