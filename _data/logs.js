const { DateTime } = require('luxon')

module.exports = async function() {
    const res = await fetch('https://rknight.me/api/meangirls.json')
    const json = await res.json()

    const nth = (d) => {
        if (d > 3 && d < 21) return 'th';
        switch (d % 10) {
            case 1:  return 'st'
            case 2:  return 'nd'
            case 3:  return 'rd'
            default: return 'th'
        }
    }

    const now = DateTime.local()

    const data = json.items.map(i => {
        const published = DateTime.fromISO(i.date_published)
        const diff = now.diff(published, ['years', 'months', 'days']).toObject()
        let diffString = ''
        if (Math.floor(diff.years) > 0) {
            diffString = `${Math.floor(diff.years)} year${Math.floor(diff.years) > 1 ? 's' : ''}`
        } 
        if (Math.floor(diff.months) > 0) {
            diffString += ` ${Math.floor(diff.months)} month${Math.floor(diff.months) > 1 ? 's' : ''}`
        } 
        if (Math.floor(diff.days) > 0) {
            diffString += ` ${Math.floor(diff.days)} day${Math.floor(diff.days) > 1 ? 's' : ''}`
        }
        return {
            date: {
                raw: i.date_published,
                human: `${published.toFormat('d')}${nth(published.toFormat('d'))} ${published.toFormat('MMMM y')}`,
                diff: diffString
            },
            url: i.url
        }
    })

    return {
        latest: data[0],
        all: data.slice(1),
    }
}