const stmt = `-- 4. Check the output of the table you just created!
SELECT 
    destination,
    spaceship_name,
    crew_size
FROM 
    space_missions
ORDER BY 
    crew_size DESC;`;
console.log(/^\s*(?:--.*?\n\s*|\/\*[\s\S]*?\*\/\s*)*(SELECT|PRAGMA|EXPLAIN)/i.test(stmt));
